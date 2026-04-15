#!/usr/bin/env sh
set -eu

docker build -t spooler/target-agent:latest -f docker/target-agent/Dockerfile .
