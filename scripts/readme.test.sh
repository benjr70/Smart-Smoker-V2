#!/usr/bin/env bash
# Tests for the root README as the project's front page (issue #569).
#
# The README is the only page most visitors read, so the things that break it
# silently are checked here as text facts about the checked-in tree: every image
# it points at is actually committed, the architecture diagram is in a fence
# GitHub will render, the licence badge resolves to the LICENSE file, and the
# retired Ralph pipeline is not advertised to newcomers.
#
# Hermetic: no Docker, no network, no npm install.
#
# Run: bash scripts/readme.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
README="${REPO_ROOT}/README.md"

TESTS_RUN=0
TESTS_FAILED=0
FAILED_NAMES=()

pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo "  PASS: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_NAMES+=("$1")
    echo "  FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "    $2"
    fi
}

# Every docs/images/readme/... path the README mentions, in any syntax:
# markdown image, markdown link, or a raw <img src="..."> tag.
readme_image_refs() {
    grep -oE 'docs/images/readme/[A-Za-z0-9._/-]+' "${README}" | sort -u
}

echo "TEST: every image the README references is committed"
refs="$(readme_image_refs)"
if [ -z "${refs}" ]; then
    fail "README references at least one image under docs/images/readme/" \
        "no docs/images/readme/ path found in README.md"
else
    pass "README references at least one image under docs/images/readme/"
    while IFS= read -r ref; do
        if [ -f "${REPO_ROOT}/${ref}" ]; then
            pass "referenced image exists: ${ref}"
        else
            fail "referenced image exists: ${ref}" "missing file: ${ref}"
        fi
    done <<< "${refs}"
fi

echo
echo "TEST: the images and their alt text agree about being placeholders"
# The repo ships generated placeholder cards until the maintainer swaps in real
# captures, so the README must not sell a placeholder as a photo. The manifest
# is the single source of truth and is checked in both directions.
MANIFEST="${REPO_ROOT}/docs/images/readme/PLACEHOLDERS.txt"
if [ ! -f "${MANIFEST}" ]; then
    fail "the placeholder manifest exists" \
        "missing file: docs/images/readme/PLACEHOLDERS.txt"
else
    pass "the placeholder manifest exists"
    placeholders="$(grep -vE '^[[:space:]]*(#|$)' "${MANIFEST}")"

    alt_text_for() {
        grep -oE "!\\[[^]]*\\]\\($1\\)" "${README}" | head -1 |
            sed -E 's/^!\[([^]]*)\].*/\1/'
    }

    while IFS= read -r ref; do
        [ -n "${ref}" ] || continue
        case "${ref}" in
            *.png | *.jpg | *.jpeg | *.gif | *.webp) ;;
            *) continue ;;
        esac
        base="$(basename "${ref}")"
        alt="$(alt_text_for "${ref}")"
        if echo "${placeholders}" | grep -qx "${base}"; then
            if echo "${alt}" | grep -qi 'placeholder'; then
                pass "placeholder ${base} is labelled as one in its alt text"
            else
                fail "placeholder ${base} is labelled as one in its alt text" \
                    "alt text '${alt}' presents a placeholder card as a real capture"
            fi
        else
            if echo "${alt}" | grep -qi 'placeholder'; then
                fail "real capture ${base} is not labelled a placeholder" \
                    "alt text '${alt}' says placeholder but ${base} is not in the manifest"
            else
                pass "real capture ${base} is not labelled a placeholder"
            fi
        fi
    done <<< "${refs}"

    while IFS= read -r base; do
        [ -n "${base}" ] || continue
        if grep -q "docs/images/readme/${base}" "${README}"; then
            pass "manifest entry ${base} is still referenced by the README"
        else
            fail "manifest entry ${base} is still referenced by the README" \
                "the manifest lists ${base}, but the README does not use it"
        fi
    done <<< "${placeholders}"
fi

echo
echo "TEST: the front page renders and links the way GitHub needs"
if grep -q '^```mermaid$' "${README}"; then
    pass "architecture diagram sits in a mermaid fence GitHub renders"
else
    fail "architecture diagram sits in a mermaid fence GitHub renders" \
        'no ```mermaid fence found in README.md'
fi

# The diagram has to describe the same data flow as CLAUDE.md, or the front page
# teaches newcomers an architecture the repo does not have.
mermaid_block() {
    awk '/^```mermaid$/{f=1;next} /^```$/{f=0} f' "${README}"
}
diagram="$(mermaid_block)"
check_edge() {
    local pattern="$1" name="$2"
    if echo "${diagram}" | grep -Eq "${pattern}"; then
        pass "${name}"
    else
        fail "${name}" "no edge matching '${pattern}' in the mermaid block"
    fi
}
# `<?-->` so either a one-way or a two-way arrow satisfies the edge.
check_edge 'FE <?-->.*BE' "diagram: web frontend links to the backend"
check_edge 'SM <?-->.*BE' "diagram: smoker app links to the backend"
check_edge 'BE <?-->.*DS' "diagram: backend links to the device service"
check_edge 'DS <?-->\|serial\| *MC' "diagram: device service reaches the board over serial"
check_edge 'MC <?-->.*HW' "diagram: the board reaches the physical hardware"

# A badge that renders but points nowhere is the usual regression here, so the
# link target is asserted, not just the image.
if grep -Eq '\[!\[License[^]]*\]\([^)]*\)\]\(LICENSE\)' "${README}"; then
    pass "licence badge links to the LICENSE file"
else
    fail "licence badge links to the LICENSE file" \
        "no [![License...](...)](LICENSE) badge in README.md"
fi

if [ -f "${REPO_ROOT}/LICENSE" ]; then
    pass "the LICENSE the badge points at exists"
else
    fail "the LICENSE the badge points at exists" "missing file: LICENSE"
fi

# The Ralph pipeline is retired (#567); newcomers must not be pointed at it.
if grep -qi 'ralph' "${README}"; then
    fail "README does not advertise the retired Ralph pipeline" \
        "found a case-insensitive 'ralph' in README.md"
else
    pass "README does not advertise the retired Ralph pipeline"
fi

echo
echo "TEST: the front page sections appear in the intended order"
# Line numbers of each landmark; a section that moved above the one before it
# means the page no longer reads hero -> pitch -> features -> diagram ->
# hardware -> how it's built -> docs -> licence.
line_of() { grep -nE "$1" "${README}" | head -1 | cut -d: -f1; }
ORDER_NAMES=(
    "hero image"
    "feature bullets"
    "architecture diagram"
    "hardware photo"
    "how it's built"
    "docs link"
    "licence"
)
ORDER_PATTERNS=(
    '^!\[[^]]*\]\(docs/images/readme/smoker-kiosk\.png\)'
    '^## Features'
    '^```mermaid$'
    '^!\[[^]]*\]\(docs/images/readme/hardware\.(png|jpe?g)\)'
    "^## How it's built"
    '^## Docs'
    '^## License'
)
prev_line=0
prev_name="start of file"
order_ok=1
for i in "${!ORDER_NAMES[@]}"; do
    line="$(line_of "${ORDER_PATTERNS[$i]}")"
    if [ -z "${line}" ]; then
        fail "section present: ${ORDER_NAMES[$i]}" \
            "no line matching '${ORDER_PATTERNS[$i]}'"
        order_ok=0
        continue
    fi
    pass "section present: ${ORDER_NAMES[$i]}"
    if [ "${line}" -le "${prev_line}" ]; then
        fail "section order: ${ORDER_NAMES[$i]} after ${prev_name}" \
            "line ${line} is not below ${prev_name} at line ${prev_line}"
        order_ok=0
    fi
    prev_line="${line}"
    prev_name="${ORDER_NAMES[$i]}"
done
if [ "${order_ok}" -eq 1 ]; then
    pass "every section is in the intended order"
fi

# The pitch paragraph sits between the hero and the feature bullets.
hero_line="$(line_of '^!\[[^]]*\]\(docs/images/readme/smoker-kiosk\.png\)')"
features_line="$(line_of '^## Features')"
if [ -n "${hero_line}" ] && [ -n "${features_line}" ] && \
   sed -n "$((hero_line + 1)),$((features_line - 1))p" "${README}" | grep -q '[A-Za-z]'; then
    pass "a pitch paragraph sits between the hero image and the features"
else
    fail "a pitch paragraph sits between the hero image and the features" \
        "nothing but whitespace between the hero image and '## Features'"
fi

echo
echo "TEST: the agent commit-share is a real number from this history"
# The claim wraps across lines (prettier reflows prose at 80), so match it
# against a whitespace-flattened copy of the file rather than line by line.
readme_flat="$(tr '\n' ' ' < "${README}" | tr -s ' ')"
share_line="$(echo "${readme_flat}" | grep -oE '[0-9]+ of the [0-9]+ commits' | head -1)"
if [ -z "${share_line}" ]; then
    fail "README quotes an agent commit share" \
        "no 'N of the M commits' claim found in README.md"
else
    pass "README quotes an agent commit share"
    claimed_agent="$(echo "${share_line}" | awk '{print $1}')"
    claimed_total="$(echo "${share_line}" | awk '{print $4}')"

    if echo "${readme_flat}" | grep -q 'Co-Authored-By: Claude' &&
       echo "${readme_flat}" | grep -q 'Generated with \[Claude Code\]'; then
        pass "README states how the share was counted"
    else
        fail "README states how the share was counted" \
            "the counting method (the commit trailers) is not named"
    fi

    if echo "${readme_flat}" | grep -qE 'as of [0-9]{4}-[0-9]{2}-[0-9]{2}'; then
        pass "README dates the share"
    else
        fail "README dates the share" "no 'as of YYYY-MM-DD' next to the claim"
    fi

    # Integer round-half-up in the shell: the suite is documented as hermetic,
    # so it must not reach for python3 (or any other interpreter) to divide.
    pct=$(((claimed_agent * 1000 / claimed_total + 5) / 10))
    if echo "${readme_flat}" | grep -qE "\(${pct}%\)"; then
        pass "the quoted percentage matches the quoted counts"
    else
        fail "the quoted percentage matches the quoted counts" \
            "${claimed_agent}/${claimed_total} rounds to ${pct}%, which the README does not state"
    fi

    # Only re-derivable against a full clone (CI fetches depth 0 for this job).
    # `master` moves under the README in both directions -- a stale checkout has
    # fewer commits than the claim, a fresh one has more -- so the recount is a
    # plausibility check, not an equality: the claim may not be inflated beyond
    # a drift window, and its ratio has to match the ratio history actually has.
    if [ "$(git -C "${REPO_ROOT}" rev-parse --is-shallow-repository 2>/dev/null)" = "false" ]; then
        base="origin/master"
        git -C "${REPO_ROOT}" rev-parse --verify --quiet "${base}" >/dev/null || base="HEAD"
        actual_total="$(git -C "${REPO_ROOT}" rev-list --count "${base}")"
        actual_agent="$(git -C "${REPO_ROOT}" log "${base}" --format=%H \
            --extended-regexp -i \
            --grep='Co-Authored-By: Claude' \
            --grep='Generated with \[Claude Code\]' | wc -l)"
        # Commits master may have moved either way since the README was written.
        DRIFT=50
        # Percentage points the claimed share may differ from the real one.
        SHARE_SLACK=5
        actual_pct=0
        if [ "${actual_total}" -gt 0 ]; then
            actual_pct=$(((actual_agent * 1000 / actual_total + 5) / 10))
        fi
        share_gap=$((pct - actual_pct))
        [ "${share_gap}" -lt 0 ] && share_gap=$((-share_gap))
        if [ "${claimed_total}" -gt "$((actual_total + DRIFT))" ] ||
           [ "${claimed_agent}" -gt "$((actual_agent + DRIFT))" ]; then
            fail "the quoted counts are backed by ${base}" \
                "README claims ${claimed_agent}/${claimed_total}; ${base} has only ${actual_agent}/${actual_total}"
        elif [ "${share_gap}" -gt "${SHARE_SLACK}" ]; then
            fail "the quoted counts are backed by ${base}" \
                "README claims a ${pct}% agent share; ${base} shows ${actual_pct}% (${actual_agent}/${actual_total})"
        else
            pass "the quoted counts are backed by ${base} (${actual_agent}/${actual_total} today)"
        fi
    else
        echo "  SKIP: recount against git history (shallow clone)"
    fi
fi

echo
echo "================================"
echo "Tests run: ${TESTS_RUN}"
echo "Failed:    ${TESTS_FAILED}"
if [ "${TESTS_FAILED}" -gt 0 ]; then
    echo "Failing tests:"
    for name in "${FAILED_NAMES[@]}"; do
        echo "  - ${name}"
    done
    exit 1
fi
echo "All README tests passed."
