# WP0 for a local model: one trunk

You are working in the DEC-H501 git repository. Do the five steps below in order. After each
command, read its output before running the next one. If any output differs from what a step
says to expect, stop and report what you saw. Do not improvise a fix.

Rules for the whole task:

- Change only the files this document names.
- Do not push. Do not touch `main` or any `track*` branch. Do not rebase or reset.
- Do not install anything.

## Step 1: check the starting point

Run:

```
git branch --show-current
git status --short
node --version
```

Expect: the branch is `track3-ic-bom`. The status shows only untracked entries: `AGENTS.md`,
`CLAUDE.md`, `README.md`, `docs/`, `package.json`, `test/`. Node is version 20 or later.

## Step 2: make the branch and commit what is already written

`package.json` and `test/smoke.test.js` already exist and already pass. Do not edit them.

```
git switch -c h500-parity
node --test
```

Expect: `# pass 4` and `# fail 0`. Then:

```
git add AGENTS.md CLAUDE.md README.md docs package.json test
git commit -m "WP0: agent instructions, parity spec, test runner, README"
```

## Step 3: merge the panel-look branch

```
git merge track4-panel-look
```

Expect a conflict in `boardEditor.js` and nowhere else. There are two conflicted places. Fix
each so the file ends up as described here, then delete every `<<<<<<<`, `=======` and
`>>>>>>>` line.

**Place 1, near the top of the file.** Keep everything from both sides. The `render`
function comes first, closed by its own `}`, and the grid-snap code follows it:

```js
function render() {
  renderCircuit(activeView(), board);
  applySelectionHighlight();
  updateBreadcrumb();
}

// Optional snap to the H-500's module-bay grid (gate footprint + a small gutter).
const GRID_CELL_X = 285;
const GRID_CELL_Y = 150;
const gridSnapToggle = document.getElementById('gridSnapToggle');

function snapToGrid(value, cellSize) {
  return Math.round(value / cellSize) * cellSize;
}
```

Everything above `function render()` that is on the "ours" side stays: `navStack`,
`selectedIds`, `setStatus`, `setComponentStatus`, `activeView`, `updateBreadcrumb`,
`applySelectionHighlight`. Do not delete any of them.

**Place 2, in the `mouseup` handler.** The block must read exactly:

```js
  if (component) {
    let newX = parseFloat(draggedElement.getAttribute('x'));
    let newY = parseFloat(draggedElement.getAttribute('y'));
    if (gridSnapToggle?.checked) {
      newX = snapToGrid(newX, GRID_CELL_X);
      newY = snapToGrid(newY, GRID_CELL_Y);
    }
    moved = newX !== component.x || newY !== component.y;
    component.x = newX;
    component.y = newY;
  }
```

If git reports no conflict at all, open `boardEditor.js` and confirm both places already
read as shown. If they do not, stop and report.

Check your work:

```
grep -c "<<<<<<<\|=======\|>>>>>>>" boardEditor.js
node --check boardEditor.js
grep -c "function snapToGrid\|function render()\|function activeView" boardEditor.js
node --test
```

Expect, in order: `0`; no output; `3`; `# pass 4` and `# fail 0`. Then:

```
git add boardEditor.js
git commit --no-edit
```

## Step 4: retire the stale documents

Three small edits. Keep everything not mentioned.

1. `context.md`: delete every section from the heading `## Current state of the codebase`
   down to, but not including, the heading `## I found a similar tool`. In their place put:

   ```
   ## Current state

   This file used to describe the August 2026 prototype. The current description of the
   code, the rules for agents and the plan are in `AGENTS.md` and `docs/`.
   ```

   The sections `## What this is` and `## I found a similar tool` stay exactly as they are.

2. `.github/agents/dec-h501.agent.md`: replace the body of the `## Current State` section
   (the bullet lines under that heading, up to the next `##` heading) with this one line:

   ```
   See `AGENTS.md` at the repository root. It replaces the description that used to be here.
   ```

3. `PLAN.md`: directly under the line `# Roadmap`, add a blank line and then:

   ```
   **Status, 2026-11-15:** tracks 1 to 4 below have landed on the `h500-parity` branch. The
   current plan is `docs/WORK-PACKAGES.md`.
   ```

Then:

```
node --test
git add context.md .github/agents/dec-h501.agent.md PLAN.md
git commit -m "WP0: point stale context files at AGENTS.md"
```

## Step 5: verify and report

```
git log --oneline --graph -8
git branch -v
git status --short
```

Expect: the log shows a merge commit joining two lines of history. `main` is still at
`525e1b2`, `track3-ic-bom` at `fea60c2`, `track4-panel-look` at `b60a9c5`. The status is
empty.

Finish with a report under these five headings, as `AGENTS.md` requires:

1. **Changed**
2. **Tests**: paste the last lines of `node --test`
3. **Checked by hand**: write "nothing; the browser check is left to Brent"
4. **Not verified**
5. **Spec questions**
