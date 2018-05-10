#!/bin/bash

SCRIPT="sudo forever -c node server.js"
LOGFILE=./log/mftm.log
PIDFILE=./log/mftm.pid

# the server was written to be run from the project root
cd /home/ubuntu/messages-from-the-mines/mftm-backend

# run in the background writing stdout + stderr to LOGFILE
$SCRIPT &> $LOGFILE &

# write the process ID to PIDFILE
echo $! > $PIDFILE
