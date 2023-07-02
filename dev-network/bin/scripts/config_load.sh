#!/bin/bash

if [ -f "$CONFIG_FILE" ]; then
  . $CONFIG_FILE
fi

SSH="ssh $DEV_NETWORK_USER_NAME@$DEV_NETWORK_IP"

if [ -n "$DEV_NETWORK_USER_IDENTITY_FILE" ]; then
  SSH="$SSH -i $DEV_NETWORK_USER_IDENTITY_FILE"
fi