# /bin/bash
bitcoind -daemon \
    -zmqpubrawtx=tcp://127.0.0.1:28332 \
    -zmqpubrawblock=tcp://127.0.0.1:28332 \
    -zmqpubhashtx=tcp://127.0.0.1:28332 \
    -zmqpubhashblock=tcp://127.0.0.1:28332 \
    -addnode=188.116.140.127:8333 \
	-addnode=178.213.117.52:8333 \
	-addnode=94.100.31.250:8333 \
	-addnode=109.110.95.201:8333 \
	-addnode=91.206.18.83:8333 \
	-addnode=91.206.18.83.base-net.ru \
	-addnode=195.169.99.82:8333 \
	-addnode=208.67.251.126:8333 \
	-addnode=83.164.131.243:8333 \
	-addnode=188.209.52.61:8333 \
	-addnode=5.2.67.110:8333 \
	-addnode=213.5.36.58:8333 \
	-addnode=213-5-36-58.static.ip.bodata.dk \
	-addnode=185.150.189.51:8333 \
	-addnode=185.50.232.114:8333 \
	-addnode=static-185-50-232-114.dsl.telematica.at \
	-addnode=138.118.139.212:8333 \
	-addnode=94.199.178.17:8333-addnode \
	-debug=zmq \
	-logips=1

# can test with
# curl --user braxxox:braxxoxbraxxoxpass123 \
#	--data-binary '{"jsonrpc":"1.0","id":"curltext","method":"getpeerinfo","params":[]}' \
# 	-H 'content-type:text/plain;' http://127.0.0.1:8332