function getBlockMessages(index, connection, callback) {
	
	let returnedQueries = 0
	const messages = []

	var params = {block_height: index, table: 'ascii_coinbase_messages'}
	let query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'ascii coinbase message'))
	
	params.table = 'utf8_address_messages'
	query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'utf8 address message'))

	params.table = 'op_return_utf8_address_messages'
	query = buildSQLSelectQuery(params, connection)
	connection.query(query, (e, r, f) => cb(e, r, f, 'OP_RETURN utf8 address message'))

	function cb(error, results, fields, type) {
		returnedQueries++
		if (error) callback(error, null)
		results = _processMessageResults(results, type)
		messages.push(...results)
		if (returnedQueries == 3) callback(null, messages)
	}
}

function _processMessageResults(results, type) {
	return results.map(result=> {
		let data = (type.indexOf('utf8') > -1) ? _decodeHexString(result.data) : result.data
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

function getBlocklist(nsfw, bookmarked, connection, callback) {
	
	let returnedQueries = 0
	const blocklist = []

	_getBlocklist(nsfw, bookmarked, 'ascii_coinbase_messages', connection, cb)
	_getBlocklist(nsfw, bookmarked, 'utf8_address_messages', connection, cb)
	_getBlocklist(nsfw, bookmarked, 'op_return_utf8_address_messages', connection, cb)

	function cb(err, res) {
		returnedQueries++
		if (err) callback(err, null)
		blocklist.push(...res)
		if (returnedQueries == 3) callback(null, blocklist)
	}
}

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


function buildSQLSelectQuery(params, connection) {

	const supportedTables = ['ascii_coinbase_messages', 
	                         'utf8_address_messages', 
	                         'file_address_messages', 
	                         'op_return_utf8_address_messages',
	                         'op_return_file_address_messages']
	const table = (params.table && supportedTables.indexOf(params.table) > -1) 
	              ? params.table : 'ascii_coinbase_messages'
	let query = `SELECT * FROM ${connection.escapeId(table)} `

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

	if (params.unique === 'true') {
		query += 'GROUP BY `data` '
	}

	query += 'ORDER BY `id` '
	if (params.limit) {
		query += `LIMIT ${params.offset ? Math.max(parseInt(params.offset), 0) + ',' : ''}${params.limit}`
	}
	query += ';'
	return query
}

function buildSQLUpdateQuery(params, connection) {
	
	let updateVal = params.value
	if (updateVal === true) updateVal = 1
	else if (updateVal === false) updateVal = 0

	let query = `UPDATE ${connection.escapeId(params.table)} `
	query += `SET ${connection.escapeId(params.update)} = ${connection.escape(updateVal)} `
	query += `WHERE \`id\` = ${connection.escape(params.id)} LIMIT 1;`
	return query
}

function _decodeHexString(hexString) {
	
	let decoded = ''
	for (let i = 0; i < hexString.length - 2; i += 2) {
		var decimalValue = parseInt(hexString.slice(i, i + 2), 16); // Base 16 or hexadecimal
		decoded += String.fromCharCode(decimalValue);
	}
	return decoded	
}

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
	getBlockMessages
}