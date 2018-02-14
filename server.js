const zmq = require('zmq')
const zmqSock = zmq.socket('sub')
 
zmqSock.connect('tcp://127.0.0.1:28332')
zmqSock.subscribe('zmqpubhashtx')
zmqSock.subscribe('zmqpubhashblock')
zmqSock.subscribe('') // this needs to be here
 
zmqSock.on('message', function(topic, message) {
  console.log('received a message related to:', topic.toString())
})
