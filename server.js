const fs          = require('fs')
const mysql       = require('mysql')
const http        = require('http')
const https       = require('https')
const socketio    = require('socket.io')
const express     = require('express')
const cors        = require('cors')
const bodyParser  = require('body-parser')
const basicAuth   = require('express-basic-auth')
const utils       = require('./src/utils')
const _           = require('underscore')
const path        = require('path')
const morgan      = require('morgan')
const rfs         = require('rotating-file-stream')

// LOAD config.js
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))

// MYSQL server connection -----------------------------------------------------

const dbPool = mysql.createPool(config.mysql)

// Express server --------------------------------------------------------------

const credentials = {
	key: fs.readFileSync(config.ssl.key, 'utf8'),
	cert: fs.readFileSync(config.ssl.cert, 'utf8')
}

const app         = express()
const httpsServer = https.createServer(credentials, app)
const io          = socketio(httpsServer)

// ensure log directory exists
const logDir = path.join(__dirname, 'log')
fs.existsSync(logDir) || fs.mkdirSync(logDir)

// create a rotating write stream
const accessLogStream = rfs('access.log', {
	interval: '1d', // rotate daily
	path: logDir,
	compress: 'gzip', // compress rotated files,
	maxSize: '1G' // only keep 1GB of total logs
})

// setup the logger to log Apache combined format to log/
app.use(morgan('combined', {stream: accessLogStream}))

io.on('connection', function (socket) {
  	console.log('[socio] socket connection established')

	// also send a list of block indexes that contain messages
	// and bookmarked messages
	dbPool.getConnection((err, connection) => {
		try {
			if (err) {
				console.error('[error] mysql database  error')
				console.error(err)
				return
			}
			
			const blocklist = {
				all: [],
				sfw: [],
				valid: [],
				bookmarked: []
			}
			
			// the highest block height that we have messages for. The max of:
			// SELECT MAX(block_height) FROM coinbase_messages WHERE `valid` = 1;
			// SELECT MAX(block_height) FROM address_messages WHERE `valid` = 1;
			// SELECT MAX(block_height) FROM op_return_address_messages WHERE `valid` = 1;
			// NOTE/WARNING: this will need to change if we update the database. Beware!
			let count = 517724

			// we will use this to know when to close the MYSQL pool connection
			const done = _.after(4, () => {
				socket.emit('blockchain-data', { blocklist, height: count })
				connection.release()
			})

			utils.getBlocklist({}, connection, (err, list) => {
				blocklist.all = list
				done()
			})

			utils.getBlocklist({ valid: true }, connection, (err, list) => {
				blocklist.valid = list
				done()
			})

			utils.getBlocklist({ sfw: true }, connection, (err, list) => {
				blocklist.sfw = list
				done()
			})

			utils.getBlocklist({ bookmarked: true }, connection, (err, list) => {
				blocklist.bookmarked = list
				done()
			})
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})
})

// allow cross-origin requests
app.use(cors())

// use basic authentication for review and review api.
// Reply with a 401 to all non-authed requests.
app.use('/review', basicAuth(config.basicAuth))
app.use('/api/review', basicAuth(config.basicAuth))

// static server for the www/mftm-frontend and then www/ folder
app.use(express.static('www/mftm-frontend'))
app.use(express.static('www'))

// e.g. http://localhost:8989/api/block?index=0 gives the genesis block
app.get('/api/block', (req, res) => {
	console.log(`[http]  GET ${req.url}`)
	const index = parseInt(req.query.index)
	
	// returns an object like
	// {
	// 	hash: ,
	// 	height: ,
	// 	time: 
	// }
	
	// given the block index, use the bitcoind JSON RPC api to get the
	// corresponding block hash
	dbPool.getConnection((err, connection) => {
		try {
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				res.sendStatus(500) 
			} else {
				utils.getBlock(index, connection, (err, block) => {
					if (err) {
						console.error('[error] error getting block')
						console.error(err)
						res.sendStatus(500)
					} else {
						res.set({'content-type': 'application/json; charset=UTF-8'})
						res.send(JSON.stringify(block))
					}
					
					connection.release()
				})
			}
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
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
		try {
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				res.sendStatus(500)
				return
			} 
			
			utils.getBlockMessages(index, connection, (err, messages) => {
				if (err) console.error(err)
				res.json(messages)
				connection.release()
			})
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})
})

app.get('/api/filter/blocklist', (req, res) => {
	console.log(`[http]  GET ${req.url}`)
	dbPool.getConnection((err, connection) => {
		try {
		
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				res.sendStatus(500)
				return
			} 
			
			utils.getBlocklist(req.query, connection, (err, list) => {
				res.send(list)
				connection.release()
			})
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})
})

// the search api used by the www/review CMS
app.get('/api/review', (req, res) => {
	
	// query the database using  the provided url params
	console.log(`[http]  GET ${req.url}`)
	dbPool.getConnection((err, connection) => {
		try {		
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				return
			}
			req.query.limit = 5 // set the limit here
			const query = utils.buildSQLSelectQuery(req.query, connection)	
			console.log(`[mysql] ${query}`)
			connection.query(query, (error, results, fields) => {
				if (error) {
					console.error(error)
					res.sendStaus(500)
				} else {
					// use the original tables to count the number of times each
					// message appears in the blockchain and use socket.io to
					// stream the results to the client with the 'data-count' event
					utils.getDataCounts(
						req.query.table.replace(/_unique$/, ''),
						results.map(x => x.data_hash),
						connection,
						function eachCount(err, dataHash, count) {
							if (err) throw err
							io.emit('data-count', { dataHash, count })
						}, 
						function done(err) {
							if (err) throw err
							connection.release()
							res.send(results)
						}
					)
				}
			})
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})

	// query the database to count the number of results
	dbPool.getConnection((err, connection) => {
		try {
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				return
			}
			const countQuery = utils.getResultsCount(req.query, connection, (err, count) => {
				if (err) throw err
				io.emit('search-count', { count, clientId: req.query.clientId })
				connection.release()
			})
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})
})

// POST requests to the /api/review can change database state
// we use this endpoint to update the mysql database
app.use('/api/review', bodyParser.json())
app.post('/api/review', (req, res) => {
	console.log(`[https]  POST ${req.body}`)
	dbPool.getConnection((err, connection) => {
		try {
			if (err) {
				console.error('[error] mysql database connection error')
				console.err(err)
				return
			}
			// query for the unique table
			const queryUniq = utils.buildSQLUpdateQuery(req.body, connection)
			
			// query for the original table
			req.body.table = req.body.table.replace(/_unique$/, '')
			const query = utils.buildSQLUpdateQuery(req.body, connection)

			console.log(`[mysql] ${queryUniq}`)
			console.log(`[mysql] ${query}`)

			// update the original and unique database in tandem
			connection.query(queryUniq, cb)
			connection.query(query, cb)

			let numQueriesReturned = 0
			function cb (error, results, fields) {
				numQueriesReturned++
				if (error) {
					console.error('[error] there may now be a database missmatch between the original table and the unique table')
					console.error(error)
					res.sendStatus(500)
					connection.release()
					throw error
				} else if (numQueriesReturned == 2) {
					res.sendStatus(204)
					connection.release()
				}
			}
		} catch (err) {
			console.error(err)
			if (connection) connection.release()
		}
	})
})

// start the server
httpsServer.listen(config.port, () => {
	console.log(`[https]  server listening at https://localhost:${config.port}`)
})
