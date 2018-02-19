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
  console.log('socket connection established')
})

// static server
app.use(express.static('www'))

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
zmqSock.subscribe('hashtx')
zmqSock.subscribe('hashblock')
// zmqSock.subscribe('') // receive all messages 

zmqSock.on('message', function(topic, message) {
	if (topic == 'hashtx') {
		io.emit('received-tx', message.toString('hex'))
	} else if (topic == 'hashblock') {
		io.emit('received-block', message.toString('hex'))
	}
})

// JSONRPC bitcoind communication ----------------------------------------------

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
