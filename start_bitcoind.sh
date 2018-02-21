# /bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# for some some of these zmq messages don't run if configured in the .conf
# so instead we will enable them manually as a cli args

bitcoind \
-conf="${DIR}/bitcoin.conf" \
-datadir=/media/bbpwn2/BBPWN_BACKUP/.bitcoin
