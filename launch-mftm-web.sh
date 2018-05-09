#!/bin/bash

SCRIPT="/home/ubuntu/.nvm/versions/node/v8.11.1/bin/node /home/ubuntu/messages-from-the-mines/mftm-backend/server.js"
LOGFILE=/home/ubuntu/messages-from-the-mines/mftm-backend/log/mftm.log
PIDFILE=/home/ubuntu/messages-from-the-mines/mftm-backend/log/mftm.pid

# the server was written to be run from the project root
cd /home/ubuntu/messages-from-the-mines/mftm-backend

# run in the background writing stdout + stderr to LOGFILE
$SCRIPT &> $LOGFILE &

# write the process ID to PIDFILE
echo $! > $PIDFILE