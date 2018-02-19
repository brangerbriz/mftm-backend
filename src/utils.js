function buildSQLSelectQuery(params, connection) {

	const limit = 5 // how many per page?
	const supportedTables = ['ascii_coinbase_messages', 
	                         'utf8_address_messages', 
	                         'file_address_messages']

	const table = (params.table && supportedTables.indexOf(params.table) > -1) 
	              ? params.table : 'ascii_coinbase_messages'

	let query = `SELECT * FROM ${connection.escapeId(table)} `

	if (params.valid ||
		params.reviewed || 
		params.bookmarked || 
		params.annotated || 
		params.transaction ||
		params.search) {

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

		// remove the trailing "AND "
		query = query.replace(/AND $/, '')
	}

	if (params.unique === 'true') {
		query += 'GROUP BY `data` '
	}

	query += 'ORDER BY `id` '
	query += `LIMIT ${params.offset ? Math.max(parseInt(params.offset), 0) + ',' : ''}${limit};`
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

module.exports = {
	buildSQLSelectQuery,
	buildSQLUpdateQuery
}