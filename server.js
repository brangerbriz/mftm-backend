const bitcoin    = require('bitcoin')
const zmq        = require('zmq')
const mysql      = require('mysql')
const http       = require('http')
const socketio   = require('socket.io')
const express    = require('express')
const bodyParser = require('body-parser')
const utils      = require('./src/utils')
const config     = require('./config')

// MYSQL server connection -----------------------------------------------------

const dbPool = mysql.createPool(config.mysql)

// Express server --------------------------------------------------------------

const app        = express()
const httpServer = http.Server(app)
const io         = socketio(httpServer)

io.on('connection', function (socket) {
  	console.log('[socio] socket connection established')
  	
  	// send the current block height on socket connection
  	rpcClient.getBlockCount((err, count) => {
  		
  		if (err) {
  			console.error(err)
  		} else {
  			socket.emit('block-count', count)
  		}

  		// also send a list of block indexes that contain messages
  		// and bookmarked messages
		dbPool.getConnection((err, connection) => {

			// we will use this to know when to close the MYSQL pool connection
			let queriesReturned = 0
			
			// all messages, including nsfw
			utils.getBlocklist(null, null, connection, (err, blocklist) => {
				queriesReturned++
				if (queriesReturned == 2) connection.release()
				io.emit('message-blocklist', blocklist)
			})

			// bookmarked messages, including nsfw
			utils.getBlocklist(null, true, connection, (err, blocklist) => {
				queriesReturned++
				if (queriesReturned == 2) connection.release()
				io.emit('bookmarked-blocklist', blocklist)
			})
		})
  	})
})

// static server for the www/ folder
app.use(express.static('www'))

// the bitcoind rest API doesn't support CORs from localhost:8989, so we
// essentially proxy a request to that API exposed at /api/block
// e.g. http://localhost:8989/api/block?index=0 gives the genesis block
app.get('/api/block', (req, res) => {
	console.log(`[http]  GET ${req.url}`)
	const index = parseInt(req.query.index)
	// given the block index, use the bitcoind JSON RPC api to get the
	// corresponding block hash
	rpcClient.getBlockHash(index, (err, hash) => {
		if (err) {
			res.status(200).send({error: err.message, code: err.code})
		} 
		else {
			// make the "proxied" request to the bitcoind REST API using the block hash
			const url = `http://localhost:${config.bitcoinRPCClient.port}/rest/block/${hash}.json`
			http.get(url, apiRes => {		  		

		  		res.set({'content-type': 'application/json; charset=UTF-8'})
		  		// couldn't get streaming to work (didn't try too hard)
		  		// so instead we will store the buffer in mem, yuck!
		  		let dat = Buffer.from('')
		  		
		  		apiRes.on('data', data => {
		    		dat += data
		  		})
				
				// once we get the result from the bitcoind REST API, forward
				// it along as the result to the original /api/block request
				apiRes.on("end", () => {
			   		res.end(dat)
				})
			})
		}
	})
})

// get an array of message objects for a block using it's block height index
// e.g. http://localhost:8989/api/block/messages?index=0
// could probably use some error handling in here, but ヽ(´ー｀)┌
app.get('/api/block/messages', (req, res) => {
	console.log(`[http]  GET ${req.url}`)
	const index = parseInt(req.query.index)
	dbPool.getConnection((err, connection) => {
		utils.getBlockMessages(index, connection, (err, messages) => {
			connection.release()
			res.json(messages)
		})
	})
})

// the search api used by the www/review CMS
app.get('/api/review', (req, res) => {
	console.log(`[http]  GET ${req.url}`)
	dbPool.getConnection((err, connection) => {
		req.query.limit = 5 // set the limit here
		const query = utils.buildSQLSelectQuery(req.query, connection)	
		console.log(`[mysql] ${query}`)
		connection.query(query, (error, results, fields) => {
			if (error) {
				throw error
				res.send(504)
			} else {
				res.send(results)
			}
			connection.release()
		})
	})
})

// POST requests to the /api/review can change database state
// we use this endpoint to update the mysql database
app.use('/api/review', bodyParser.json())
app.post('/api/review', (req, res) => {
	console.log(`[http]  POST ${req.body}`)
	dbPool.getConnection((err, connection) => {
		const query = utils.buildSQLUpdateQuery(req.body, connection)	
		console.log(`[mysql] ${query}`)
		connection.query(query, (error, results, fields) => {
			console.log(results)
			if (error) {
				res.sendStatus(504)
				throw error
			} else {
				res.sendStatus(200)
			}
			connection.release()
		})
	})
})

// start the server
httpServer.listen(config.port, () => {
	console.log(`[http]  server listening at http://localhost:${config.port}`)
})

//ZeroMQ bitcoind communication ------------------------------------------------

const zmqSock = zmq.socket('sub')
zmqSock.connect(config.bitcoinZMQAddress)
zmqSock.subscribe('rawtx') // this event never fires!
zmqSock.subscribe('hashtx')
zmqSock.subscribe('rawblock')
zmqSock.subscribe('hashblock')
zmqSock.subscribe('') // receive all messages 

zmqSock.on('message', function(topic, message) {
	// if (topic.toString() != 'hashtx') console.log(topic.toString(), message.length)
	if (topic == 'rawtx') {

		rpcClient.decodeRawTransaction(message.toString('hex'), (err, tx) => {
			io.emit('received-tx', tx)
		})
		
	} else if (topic == 'hashblock') {
		let blockHash = message.toString('hex')
		console.log(`[zmq]   recieved a new block ${message.toString('hex')}`)
		const url = `http://localhost:${config.bitcoinRPCClient.port}/rest/block/${blockHash}.json`
		http.get(url, apiRes => {		  		

	  		// couldn't get streaming to work (didn't try too hard)
	  		// so instead we will store the buffer in mem, yuck!
	  		let dat = Buffer.from('')
	  		
	  		apiRes.on('data', data => {
	    		dat += data
	  		})
			
			// once we get the result from the bitcoind REST API, forward
			// it along as the result to the original /api/block request
			apiRes.on("end", () => {
				try {
					const block = JSON.parse(dat.toString())
					// emit the socket.io event
		   			io.emit('received-block', JSON.parse(dat.toString()))
				} catch (err) { /* NOP, in case the response isn't JSON */ } 
			})
		})
	}
})

// JSONRPC bitcoind communication ----------------------------------------------

// https://en.bitcoin.it/wiki/Original_Bitcoin_client/API_calls_list
const rpcClient = new bitcoin.Client(config.bitcoinRPCClient)

// broadcast the current list of bitcoind peers to all connected socket.io
// clients at an interval set by config.peerInfoRefreshInterval
setInterval(() => {
	rpcClient.getPeerInfo(function(err, data) {
		if (err) {
			console.log('[!] error in rpcClient.getPeerInfo(...)')
			console.error(err)
		}
		else {
			io.emit('peer-info', data)
		}
	})
}, config.peerInfoRefreshInterval)
