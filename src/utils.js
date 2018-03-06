function getDataCounts(table, dataHashes, connection, countCb, doneCb) {

	let pairs = dataHashes.map(hash => {
		return {
			hash,
			query: `SELECT COUNT(id) FROM ${connection.escapeId(table)} WHERE data_hash = ${connection.escape(hash)};`
		}
	})

	let numQueriesReturned = 0
	pairs.forEach(pair => {
		connection.query(pair.query, (error, results, fields) => {
			numQueriesReturned++
			if (error) {
				countCb(error, null, null)
				doneCb(error)
			} else {
				countCb(null, pair.hash, results.map(x => x['COUNT(id)'])[0])
				if (numQueriesReturned == dataHashes.length) {
					doneCb(null)
				}
			}
		})
	})
}

function getResultsCount(params, connection, callback) {
	let query = buildSQLSelectQuery(params, connection)
	query = query.replace(/^SELECT \*/, 'SELECT COUNT(*)')
	query = query.replace(/ LIMIT .+;$/, ';')
	connection.query(query, (error, results, fields) => {
		if (error) callback(error, null)
		else callback(null, results.map(x => x['COUNT(*)'])[0])
	})
}

// get an array of all of the messages from a certain block (using it's index)
// from the mysql database. searches three tables:
//     - coinbase_messages
//     - address_messages
//     - op_return_messages
function getBlockMessages(index, connection, callback) {
	
	let returnedQueries = 0
	const messages = []

	var params = {block_height: index, table: 'coinbase_messages'}
	let query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'coinbase message'))
	
	params.table = 'address_messages'
	query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'address message'))

	params.table = 'op_return_address_messages'
	query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'OP_RETURN address message'))

	function cb(error, results, fields, type) {
		returnedQueries++
		if (error) callback(error, null)
		results = _processMessageResults(results, type)
		messages.push(...results)
		if (returnedQueries == 3) callback(null, messages)
	}
}

// transform mysql database results into a format 
// more friendly for the front-end to receive
function _processMessageResults(results, type) {
	return results.map(result=> {
		let data = result.utf8_data
		// format by adding a \n at every 20th character
		if (result.format) data = _formatUTF8(data) 
		return {
			transaction_hash: result.transaction_hash,
			data: data,
			annotation: result.annotation,
			nsfw: result.nsfw == 1,
			block_timestamp: result.block_timestamp,
			type: type,
			tags: result.tags.split(',')
			                 .map(tag => tag.trim())
			                 .filter(x => x != '')
		}
	})
}

// get a list of block height indicies that contain address messages. 
// nsfw and bookmarked params act as a filter. nsfw actually == !nsfw (whoops!)
function getBlocklist(nsfw, bookmarked, connection, callback) {
	
	let returnedQueries = 0
	const blocklist = []

	_getBlocklist(nsfw, bookmarked, 'coinbase_messages', connection, cb)
	_getBlocklist(nsfw, bookmarked, 'address_messages', connection, cb)
	_getBlocklist(nsfw, bookmarked, 'op_return_address_messages', connection, cb)

	function cb(err, res) {
		returnedQueries++
		if (err) callback(err, null)
		blocklist.push(...res)
		if (returnedQueries == 3) callback(null, blocklist)
	}
}

// internal method to extract blocklist from a single table
function _getBlocklist(nsfw, bookmarked, table, connection, callback) {
	
	let query = `SELECT DISTINCT block_height FROM ${table} WHERE valid = 1 `
	if (nsfw) {
		// only safe for work
		query += `AND nsfw = 0 `
	}

	if (bookmarked) {
		query += `AND bookmarked = 1 `
	}
	query += 'ORDER BY block_height;'
	connection.query(query, (error, results, fields) => {
		if (error) {
			callback(error, null)
		} else {
			callback(null, results.map(res => res.block_height))
		}
	})
}

// build a semi-complex mysql query from a params object (usually GET url params)
function buildSQLSelectQuery(params, connection) {

	const supportedTables = ['coinbase_messages', 
	                         'address_messages', 
	                         'file_address_messages', 
	                         'op_return_address_messages',
	                         'op_return_file_address_messages',
	                         'coinbase_messages_unique', 
	                         'address_messages_unique', 
	                         'op_return_address_messages_unique' ]

	const table = (params.table && supportedTables.indexOf(params.table) > -1) 
	              ? params.table : 'coinbase_messages'
	let query = `SELECT *, CONVERT(UNHEX(\`data\`) USING utf8) as utf8_data FROM ${connection.escapeId(table)} `

	if (params.valid ||
		params.reviewed || 
		params.bookmarked || 
		params.annotated || 
		params.transaction ||
		params.search ||
		params.nsfw ||
		params.tags ||
		typeof params.block_height !== 'undefined') {

		query += `WHERE `

		if (params.valid) {
			query += `valid = ${params.valid === 'true' ? 1 : 0} AND `
		} 

		if (params.reviewed) {
			query += `reviewed = ${params.reviewed === 'true' ? 1 : 0} AND `
		} 

		if (params.bookmarked) {
			query += `bookmarked = ${params.bookmarked === 'true' ? 1 : 0} AND `
		}

		if (params.nsfw) {
			query += `nsfw = ${params.nsfw === 'true' ? 1 : 0} AND `
		}

		if (params.annotated === 'true') {
			query += `annotation != '' `
		} else if (params.annotated === 'false') {
			query += `annotation = '' `
		}

		if (params.transaction) {
			query += `transaction_hash = ${connection.escape(params.transaction)} AND `
		}

		if (params.search) {
			query += `\`data\` LIKE ${connection.escape('%' + params.search + '%')} AND `
		}

		if (typeof params.block_height !== 'undefined') {
			query += `block_height = ${connection.escape(params.block_height)} AND `
		}

		if (params.tags && params.tags.length > 0) {
			query += '( '
			params.tags.forEach(tag => {
				query += `tags LIKE '%,${tag},%' OR `
			})
			query = query.replace(/ OR $/, ' ) ')
		}

		// remove the trailing "AND "
		query = query.replace(/AND $/, '')
	}

	query += 'ORDER BY `id` '
	if (params.limit) {
		query += `LIMIT ${params.offset ? Math.max(parseInt(params.offset), 0) + ',' : ''}${params.limit}`
	}
	query += ';'
	return query
}

// build a simple mysql UPDATE query from a limited params object
function buildSQLUpdateQuery(params, connection) {
	
	let updateVal = params.value
	if (updateVal === true) updateVal = 1
	else if (updateVal === false) updateVal = 0

	let query = `UPDATE ${connection.escapeId(params.table)} `
	query += `SET ${connection.escapeId(params.update)} = ${connection.escape(updateVal)} `
	query += `WHERE \`data\` = ${connection.escape(params.data)};`
	return query
}

// some people format the data they save in the blockchain neatly into 20 byte
// sections to fit in the size of each address. If they do that, and we concatenate
// all addresses together, we essentially "unformat" their implied "\n" characters.
// this function returns a new string with "\n" characters injected every 20 bytes
// of the input data to re-format messages to be how the author would have originally
// intended them
function _formatUTF8(data) {
	if (data.length < 20) return
	let formatted = ''
	for (let i = 0; i < data.length - 20; i += 20) {
		formatted += data.slice(i, i + 20) + '\n'
	}
	return formatted
}

module.exports = {
	buildSQLSelectQuery,
	buildSQLUpdateQuery,
	getBlocklist,
	getBlockMessages,
	getDataCounts,
	getResultsCount
}