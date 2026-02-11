# Level Generation Ruleset

## Core Principles
Every generated level must be 100% solvable without requiring external knowledge or debug commands.

## Rule 1: Guaranteed Path (CRITICAL)
- The sequential room connection (room 0 → room 1 → room 2 → ... → room N) must NEVER have locked doors
- This ensures players can always progress through the facility
- Only extra/optional doors may be locked
- **IMPLEMENTATION**: `forceLocked = false` for main path doors, `forceLocked = true` for extra doors

## Rule 2: Key Accessibility
- Every locked door MUST have a corresponding key placed in an ACCESSIBLE location
- "Accessible" means reachable from spawn without passing through ANY locked doors
- Keys must be placed in rooms different from the door's room
- Keys must not be placed in the spawn room (room 0)

## Rule 3: Room Connectivity
- Rooms must be positioned with minimal spacing (0.1 units) to prevent gaps
- Doors must be placed at the EXACT midpoint between connected rooms
- Door positioning calculation: `room1.center + (room2.center - room1.center) / 2`
 - Doors must NEVER overlap (no intersecting/stacked door volumes)
 - Do not place more than 2 doors on the same wall of a room

## Rule 4: Resource Distribution
- Obvious pickups should be minimal (0-2 per category)
- 30% of props should contain loot to encourage exploration
- Props should be plentiful (4 per room average) for tactical cover
 - The level must include some visible pickups placed in rooms (not only inside destructible props)
 - Minimum visible non-key pickups: 2 per level (ammo/health/armor)

## Rule 5: Lighting Requirements
- Each room must have its own point light at the center
- Ambient light intensity: 2.5
- Hemisphere light intensity: 1.2
- Point light intensity: 120, range: 30

## Rule 6: Prop Stacking Physics (NEW)
- Stacked props MUST touch the prop below them
- No floating props without proper support
- Height calculation: `stackedY = -2 + (baseScale * 1.0)`
- Each level must physically contact the level below
- Only crates/metal crates can stack (barrels cannot support weight)
 - Stacked crates do NOT need to be perfectly centered; small horizontal offsets / different arrangements are allowed as long as they are supported and touching

## Rule 7: Prop Arrangement Variety (NEW)
- 25% single props (no stacking)
- 25% single stack (1 prop on top)
- 25% double stack (2 props side-by-side on top)
- 15% pyramid arrangement (3 levels)
- 10% cluster grouping (2-3 props in circle)

## Rule 8: Door Frequency (UPDATED)
- Main path doors: 100% unlocked (room count - 1 doors)
- Extra doors: 40% of room count, 80% locked for puzzles
- Total locked doors should be significant for gameplay

## Rule 9: Validation Checklist
Before returning a level, verify:

### Door Validation
- [ ] Main path doors (sequential connections) are NOT locked
- [ ] Every locked door has a key with matching keyId
- [ ] All keys are in accessible rooms
- [ ] No keys are in spawn room
- [ ] No keys are in the same room as their door
 - [ ] Doors do not overlap
 - [ ] No room has more than 2 doors on the same wall

### Room Validation  
- [ ] Room spacing is ≤ 0.5 units
- [ ] No room overlaps with others
- [ ] All rooms are reachable from spawn via unlocked doors

### Lighting Validation
- [ ] Each room has a point light at its center
- [ ] Ambient and hemisphere lights are present

### Resource Validation
- [ ] At least one weapon is accessible in early rooms
- [ ] Keys are not required to progress through main path
 - [ ] At least 2 visible non-key pickups exist in accessible rooms (ammo/health/armor)

### Prop Validation (NEW)
- [ ] All stacked props touch the prop below
- [ ] No floating props without support
- [ ] Stack heights calculated correctly: `y = -2 + cumulativeHeight`
- [ ] Only appropriate prop types stack

## Rule 10: Error Handling
If any validation fails:
1. Log the specific rule violation
2. Regenerate the problematic element
3. Re-run validation
4. If 3 attempts fail, generate entirely new level

## Rule 11: Generation Order
1. Generate rooms with proper spacing
2. Create sequential doors (unlocked) - CRITICAL: forceLocked=false
3. Add extra doors (forceLocked=true for 80%)
4. Calculate accessible rooms via flood fill
5. Place keys ONLY in accessible rooms
6. Generate props with proper stacking physics
7. Add other pickups and resources
8. Final validation

## Rule 12: Debug Logging
Log these generation details for debugging:
- Total rooms generated
- Main path door count and lock status (should be 0 locked)
- Extra door count and locked status
- Key placement locations
- Accessible room count
- Prop stacking patterns created
- Any validation failures

## Implementation Notes
- Use flood fill algorithm to determine accessible rooms
- Store locked doors separately during generation for key placement
- Always validate before returning the level schema
- Include room IDs in debug logs for troubleshooting
- **CRITICAL**: Main path doors MUST use `forceLocked=false`
- **CRITICAL**: Extra doors MUST use `forceLocked=true` for locked doors
