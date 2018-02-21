let filter = {
	table: 'ascii_coinbase_messages',
	reviewed: undefined,
	valid: undefined,
	bookmarked: undefined,
	unique: true,
	transaction: undefined,
	nsfw: undefined,
	annotated: undefined,
	search: undefined,
	tags: '',
	offset: 0
}

// let results = [{
// 	id: 0,
// 	transaction: 'hash',
// 	data: 'blah blah',
// 	filetype: 'text',
// 	valid: true,
// 	tags: ['blah', 'blue', 'blarb'],
// 	bookmarked: false,
// 	annotated: "here yee lies the king",
//  nsfw: false
// 	reviewed: null
// }]

var app = new Vue({
  el: '#app',
  data: { filter, results: [], autoreview: false },
})

Vue.config.devtools = true

document.getElementById('filter-button').onclick = search

document.getElementById('next-button').onclick = () => {
	
	app.filter.offset = parseInt(app.filter.offset) + 5

	if (app.autoreview) {
		app.results.forEach((result) => {
			result.reviewed = true
			updateRecord('reviewed', result)
		})
	}
	
	search()
	window.scrollTo(0, 0)
}

document.getElementById('prev-button').onclick = () => {
	app.filter.offset = Math.max(0, parseInt(app.filter.offset) - 5)
	search()
	window.scrollTo(0, 0)
}

String.prototype.insertAt=function(index, string) { 
  return this.substr(0, index) + string + this.substr(index);
}

String.prototype.removeCharAt = function(index) {
	return this.slice(0, index) + this.slice(index + 1);
}

document.onload = search()

function decodeHexString(hexString) {
	
	let decoded = ''
	for (let i = 0; i < hexString.length; i += 2) {
		var decimalValue = parseInt(hexString.slice(i, i + 2), 16); // Base 16 or hexadecimal
		decoded += String.fromCharCode(decimalValue);
	}
	return decoded
	
}

function encodeHexString(string) {
	let encoded = ''
	for (let i = 0; i < string.length; i++) {
		encoded += string.charCodeAt(i).toString(16)
	}
	return encoded
}

function formatUTF8(result) {

	if (result.displayData.length < 20) return

	if (result.format) {
		let formatted = ''
		for (let i = 0; i < result.displayData.length - 20; i += 20) {
			formatted += result.displayData.slice(i, i + 20) + '\n'
		}
		result.displayData = formatted
	}
}

function search() {

	// make a copy, because we are going to mutate some of the data and 
	// we don't want that to show up in the view
	let filter = JSON.parse(JSON.stringify(app.filter))

	if (filter.transaction == '') filter.transaction = undefined
	if (filter.search == '') filter.search = undefined

	if (filter.search && filter.table.indexOf('utf8') > -1) {
		filter.search = encodeHexString(filter.search)
	}

	filter.tags = app.filter.tags.split(',')
								 .map(x => x.trim())
								 .filter(x => x != '')

	const url = `${window.location.protocol}//${window.location.host}/api/review?${Qs.stringify(filter)}`
	fetch(url, { method: 'get' })
	.then(res => res.json())
	.then(json => {
		json.forEach(obj => {
			obj.expanded = false
			obj.displayData = obj.data
			if (filter.table.indexOf('utf8') > -1) {
				obj.displayData = decodeHexString(obj.displayData)
				if (obj.format) {
					formatUTF8(obj)
				}
			}
			obj.tags = decodeTagString(obj.tags)
		})
		app.results = json
	})
}

function encodeTagsString(tags) {
	return ',' + tags.split(',').map(x => x.trim()).filter(x => x != '').join(',') + ','
}

function decodeTagString(string) {
	return string.split(',') // replace ','
	             .join(', ') // with ', '
	             .replace(/^, /, '') // remove leading ', '
	             .replace(/, $/, '') // remove trailing ', '
}

function updateRecord(prop, result) {
	
	const url = `${window.location.protocol}//${window.location.host}/api/review`
	
	let value = result[prop]
	if (prop == 'tags') {
		console.log('before: ' + value)
		value = encodeTagsString(value)
		console.log('after: ' + value)
	}

	const body = {
		table: filter.table,
		data: result.data,
		update: prop,
		value: value
	}
	
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
	}

	fetch(url, { method: 'post', body: JSON.stringify(body), headers })
}