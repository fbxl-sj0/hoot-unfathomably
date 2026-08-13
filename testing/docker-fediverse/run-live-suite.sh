#!/usr/bin/env bash

# Project: Hoot Unfathomably
# --------------------------
#
# File: run-live-suite.sh
#
# Purpose:
#
#   Run the destructive compatibility suite against one disposable local
#   Fediverse server.
#
# Responsibilities:
#
#   - Validate the environment required by the live Jest suite
#   - Refuse public and non-loopback targets
#   - Pass credentials through environment variables instead of arguments
#   - Run the authenticated matrix test serially
#
# This file intentionally does NOT contain:
#
#   - Fediverse server provisioning
#   - public-instance credentials
#   - persistent test-data cleanup outside the test suite

set -euo pipefail

required_variables=(
  HOOT_MATRIX_FAMILY
  HOOT_MATRIX_ORIGIN
  HOOT_MATRIX_PRIMARY_USERNAME
  HOOT_MATRIX_PRIMARY_PASSWORD
  HOOT_MATRIX_SECONDARY_USERNAME
  HOOT_MATRIX_SECONDARY_PASSWORD
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "${variable_name}" >&2
    exit 2
  fi
done

case "${HOOT_MATRIX_FAMILY}" in
  unfathomably|rebased|pleroma|akkoma|mastodon)
    ;;
  *)
    printf 'Unsupported HOOT_MATRIX_FAMILY: %s\n' "${HOOT_MATRIX_FAMILY}" >&2
    exit 2
    ;;
esac

case "${HOOT_MATRIX_ORIGIN}" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
    ;;
  *)
    printf '%s\n' \
      'The live suite only accepts a loopback origin because it creates posts, lists, filters, follows, and reports.' >&2
    exit 2
    ;;
esac

export HOOT_DOCKER_MATRIX=1

npx jest \
  services/__tests__/FediverseDockerMatrix.live.test.ts \
  --runInBand \
  --verbose

# end of run-live-suite.sh
