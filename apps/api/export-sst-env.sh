#!/bin/bash

sst secret set $1 "$2" --stage alextripp
sst secret set $1 "$2" --stage development
sst secret set $1 "$2" --stage production
sst secret set $1 "$2" --stage staging
