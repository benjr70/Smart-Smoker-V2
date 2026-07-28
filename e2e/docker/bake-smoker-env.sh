#!/bin/sh
# Upsert KEY=VALUE assignments into a dotenv file, in place.
#
#   bake-smoker-env.sh <env-file> [KEY=VALUE ...]
#
# Used by the `smoker-build` stage of stack.Dockerfile to point the smoker web
# bundle at a per-PR stack's remapped host ports before webpack compiles them in.
#
# This is small but not trivial, which is why it is a script rather than an
# inline RUN: every failure mode here is silent. A mangled assignment still
# produces a bundle and a zero exit, so the stack boots and serves a page that
# quietly talks to the wrong ports — the symptom surfaces much later, as a
# confusing partial failure in a verification run. Being a file makes it
# unit-testable (scripts/stack-runner/bake-smoker-env.test.ts).
#
# Each key is rewritten by reading the file and emitting a new one line by line,
# rather than by `sed -i`. Values here are URLs, and in a sed replacement `&`
# expands to the whole match, so a query string would corrupt the very line it is
# meant to set. Rewriting also sidesteps dotenv files that lack a trailing
# newline (the shipped apps/smoker/.env.prod does), where appending would
# otherwise glue a new assignment onto the last line.
#
# An assignment's key is everything before the first `=`, its value everything
# after, so values may themselves contain `=`.
set -eu

env_file="$1"
shift

for assignment in "$@"; do
    key="${assignment%%=*}"
    value="${assignment#*=}"

    # An empty value means the caller has nothing to say about this key; the
    # statically-compiled default must survive rather than be blanked.
    [ -n "$value" ] || continue

    tmp="$env_file.bake"
    replaced=0
    : >"$tmp"

    # `|| [ -n "$line" ]` keeps the final line when the file has no trailing
    # newline; read reports failure there but still fills $line.
    while IFS= read -r line || [ -n "$line" ]; do
        if [ "${line%%=*}" = "$key" ]; then
            printf '%s=%s\n' "$key" "$value" >>"$tmp"
            replaced=1
        else
            printf '%s\n' "$line" >>"$tmp"
        fi
    done <"$env_file"

    [ "$replaced" -eq 1 ] || printf '%s=%s\n' "$key" "$value" >>"$tmp"
    mv "$tmp" "$env_file"
done
