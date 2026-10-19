# Step 5 — Design changes (2026-10-16)

This file records the changes made to the design source files in this folder, following the audit and the decisions of the product doc (version 0.3). It is the list to apply to the boards.

**Scope.** Local source files and, after the owner's confirmation, the published Claude Design artifacts on claude.ai (both published; see section 9).

---

## 1. Tokens (`../../design-system/ds-build/project/tokens.json`)

A backup of the previous file is kept in the session scratchpad (`tokens.before-step5.json`).

### 1.1 Light theme only (rule R9)
All dark values are removed. The `dark` theme is no longer listed.

### 1.2 Contrast fixes (WCAG 2.2 AA)

| Token | Before | After | Reason and contrast (on white) |
|---|---|---|---|
| `primary` (text, links, filled buttons) | `#6366f1` (4.47:1 with white text) | `#4f46e5` | 6.29:1 with white text |
| `primary-hover` | — | `#4338ca` | 7.90:1 with white text |
| `ring` (focus) | — | `#4f46e5` | Visible focus (WCAG 2.4.7) |
| `destructive` (icons, borders) | `#ef4444` (used for text too) | `#ef4444` kept for icons and borders | 3.76:1: not for text |
| `destructive-text` | — | `#dc2626` | 4.83:1: error text |
| `input` (field outline) | `#d1d5db` (1.47:1) | `#6b7280` | 4.83:1, above the 3:1 required for UI components (WCAG 1.4.11) |
| `border` (decorative) | `#d1d5db` | `#e2e8f0` | Decorative only. Fields use `input` |
| `muted-foreground` (secondary text) | `#6b7280` | `#6b7280` kept | 4.83:1 on white, 4.62:1 on the page background |

Note: `#6366f1` on the page background `#f8fafc` is 4.27:1. It must not be used for text. It stays in illustrations.

### 1.3 Typography and spacing
- No text under 11px. Badges only may use 11px. Body and captions are 12px or more. The boards use 10px for `.y-follow` and tags: change them to 12px.
- The spacing scale is 4, 8, 12, 16, 24, 32, 48, 64. Values 20, 14, 10 and 6 px found in the boards must be migrated to this scale.

---

## 2. Responsive behaviour (product doc, section 11.3)

| Breakpoint | Width | Layout |
|---|---|---|
| Desktop | 1280 px and above | Left navigation (275), main column (600), right sidebar (350) |
| Tablet | 768 px to 1279 px | Icon rail (88), main column (600), no sidebar. Includes landscape tablets (1024 px) |
| Mobile | below 768 px | Top bar with menu button, full-screen menu |

The current Desktop board is 1440 px wide, so it is compliant. Tablet landscape at 1024 px uses the Tablet layout. The boards at 1024 px must be checked for overflow.

## 3. Sidebar content on Tablet and Mobile (rule R5)

| Sidebar content (Desktop) | Tablet | Mobile |
|---|---|---|
| Search | Search field at the top of the Explore screen. Search icon in the rail | Search icon in the top bar, opens Explore |
| Trends (hashtags) | Explore screen | Explore screen |
| Suggestions to follow | Explore screen, below trends | Explore screen, below trends |
| Explanation of the 50 Y rule | Information button next to the Y counter | Same, opens a short dialog |
| Footer links (terms, privacy, help) | Settings screen | Settings screen |

**Board fix:** the Suggestions block is absent from the Explore boards on Tablet and Mobile. Add it. The review said "absent by design", which contradicts section 11.3.

---

## 4. Components and elements to add or fix

| Item | Where | Change |
|---|---|---|
| **YProgress** (49/50) | ReactionPill, QuestionPost | Show "49/50" next to the Y count. Read the threshold from the data, never hard-code 50 |
| **CharCounter** | Composer (280), reply box (280), message box (1000) | Add the counter, which is absent from the boards |
| **Skeleton** | Feed, lists, profiles | Add loading placeholder |
| **EmptyState** | Signets, Notifications, Messages, Search (no result), Blocked list, Home (no follows) | Add one per screen |
| **ErrorState** | Feed, lists, profile | Add with "Réessayer" |
| **LoadMore** | Replies, lists | "Voir plus" control, with spinner state |
| **FollowButton** | All boards | Target at least 24 × 24 px (currently 22 px) |
| **ReactionPill (active)** | Feed, replies | Change shape or label as well as background, so the active state is not colour alone |
| **Focus ring** | All interactive elements | Use the `ring` token, visible on keyboard focus |

---

## 5. Screen states to design (product doc, section 12.5)

Every screen needs these states. Items marked **missing** have no board yet.

| Screen | States to add |
|---|---|
| Home (Pour vous, M2) | Loading, empty (no content yet), error |
| Abonnements tab (M4) | Empty (no follows yet), loading |
| Explore | Search with no result, loading, error |
| Signets | Empty (already designed for Desktop, check Tablet and Mobile) |
| Notifications | Empty, error |
| Messages | Empty inbox, empty request list |
| Profile | Loading, error, hidden or unavailable account |
| Settings | Suspended-account banner, pending-deletion banner with the purge date and "Annuler la suppression" |
| All screens | 404 page "Cette page n'existe pas", session-expired redirect message |
| Question share view `/questions/[id]` | Loading, not found (new board) |

---

## 6. Boards to create (product doc, section 11.1)

These routes exist in the product doc but have no board in the design. Create them in the same style as the existing ones.

- Followers and following lists (`/u/[handle]/followers`, `/u/[handle]/following`)
- Forgot password (`/forgot-password`)
- Hashtag results (`/hashtags/[name]`)
- New message (`/messages/new`)
- Change password (`/settings/password`)
- Change email (`/settings/email`), if not yet designed
- Notification settings (`/settings/notifications`)
- Blocked accounts (`/settings/blocked`)
- Help center and About (`/settings/help`, `/settings/about`)
- Delete account (`/settings/delete-account`), with the 90-day explanation and password field
- Question share view (`/questions/[id]`)
- Administration area (`/admin`): report queue, content view, account view, deletion queue, audit log. Desktop only; not part of the public design system, but in the same visual style

## 7. Feed tabs by milestone

- **M2:** the Home screen shows only "Pour vous". The "Abonnements" tab is **removed** from the M2 boards.
- **M4:** "Abonnements" is added, and "Pour vous" also includes followed accounts.

The boards that show both tabs must be split or annotated, so the M2 build shows only "Pour vous".

---

## 8. Accessibility checks to run on the boards

- Contrast: check the text colours against the token table in section 1.2.
- Targets: 24 × 24 px minimum.
- Focus: visible on every interactive element.
- Colour: the active reaction and the Y state also change shape or label.
- Reflow at 320 px: no horizontal scrolling.

---

## 9. Republishing (done)

Published on 2026-10-16:
- Design system: version 11 (tokens, components and the five new components).
- Design page: version 70 (40 updated boards, 70 new boards, the layout index, and the design system copy the page loads).

The rebuild used the render and measure scripts in this folder only to check the work locally. Nothing was rendered for the published result.
