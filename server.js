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
  	console.log('[+] socket connection established')
  	rpcClient.getBlockCount((err, count) => {
  		if (err) {
  			console.error(err)
  		} else {
  			socket.emit('block-count', count)
  		}
  	})
})

// static server
app.use(express.static('www'))

// the bitcoind rest API doesn't support CORs from localhost:8989, so we
// essentially proxy a request to that API
app.get('/api/block', (req, res) => {
	const index = parseInt(req.query.index)
	rpcClient.getBlockHash(index, (err, hash) => {
		if (err) {
			res.status(200).send({error: err.message, code: err.code})
		} 
		else {
			const url = `http://localhost:${config.bitcoinRPCClient.port}/rest/block/${hash}.json`
			http.get(url, apiRes => {		  		

		  		res.set({'content-type': 'application/json; charset=UTF-8'})
		  		let dat = Buffer.from('') // store in mem, yuck!
		  		
		  		apiRes.on('data', data => {
		    		dat += data
		  		})
				
				apiRes.on("end", () => {
			   		res.end(dat)
				})
			})
		}
	})
})

app.get('/api/review', (req, res) => {
	dbPool.getConnection((err, connection) => {
		const query = utils.buildSQLSelectQuery(req.query, connection)	
		console.log(query)
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

// body parser
app.use('/api/review', bodyParser.json())
app.post('/api/review', (req, res) => {

	dbPool.getConnection((err, connection) => {
		const query = utils.buildSQLUpdateQuery(req.body, connection)	
		console.log(query)
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

httpServer.listen(config.port, () => {
	console.log(`[*] server listening at http://localhost:${config.port}`)
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
	if (topic.toString() != 'hashtx') console.log(topic.toString(), message.length)
	if (topic == 'hashtx') {

		// rpcClient.getTransaction(message.toString('hex'), (err, tx) => {
		// 	console.log(err)
		// 	console.log(tx)
		// })
	
		io.emit('received-tx', message.toString('hex'))
	} else if (topic == 'hashblock') {
		io.emit('received-block', message.toString('hex'))
	}
})

// JSONRPC bitcoind communication ----------------------------------------------

// https://en.bitcoin.it/wiki/Original_Bitcoin_client/API_calls_list
const rpcClient = new bitcoin.Client(config.bitcoinRPCClient)

// broadcast the current list of bitcoin peers at a set interval
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
