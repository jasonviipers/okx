#!/bin/sh
echo "CRON_SECRET=$CRON_SECRET" >> /etc/environment
echo "WORKER_URL=$WORKER_URL" >> /etc/environment
crond -f -l 2
