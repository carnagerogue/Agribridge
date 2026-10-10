# Landing page: cinematic farm-to-market story

The opening follows the user's final direction: backgrounds and words progress together as the visitor scrolls through growing, harvesting, transport, and selling. The hero stays in view during the sequence, then releases into the product tour. Scrolling backward reverses the story. Scene buttons provide direct navigation; the workspace action stays available throughout.

## Design and implementation

- Forest #102e23, ivory #f7f8f3, lime #d9f793; Georgia editorial headlines and native sans-serif controls.
- Full-bleed generated agricultural photography with an intentional left-to-right dark readability overlay. Responsive WebP variants at 640, 1024 and 1536 pixels. Images are illustrative, not photographs of actual customers.
- Scroll-driven blended image opacity, slow camera movement, changing light, staggered section reveals and responsive image crops. Motion lives outside React's per-frame rendering; React changes the narrative at chapter boundaries.
- Reduced-motion preferences and the pause control remove the pinned scroll sequence. All scene buttons remain usable. Background animation stops outside the viewport or when the document is hidden.
- Only the growing image is requested initially. Later frames load when the visitor starts the story. The last available image remains visible while another loads.
- Real HTML text, navigation and product preview controls. Sample task completion and reopening are isolated from saved farm data. Existing login, authenticated workspace access, source disclosures and offline explanations remain available.

## Visual comparison ledger

Concept: `C:/Users/Administrator/.codex/generated_images/01a12378-0f8e-7ee3-b1da-f090e7b2b080/exec-394ed917-7238-46ef-adfc-b9bee2c5bebe.png`.
Browser screenshots: `.data/design-review/landing-story-harvest.png`, `landing-cooperative.png`, `landing-workflow.png`, and mobile evidence. Captured through Codex IAB, with the concept and current render inspected using view_image.

| Comparison          | Evidence and resolution                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero composition    | Full-width photography, large left-aligned headline, quiet navigation and lime primary action retained. Full-viewport sticky framing replaces the static 860px concept at the user's request. |
| Typography          | White serif headline and italic lime second line match the direction. An inherited dark heading color was fixed. Live text now changes at each chapter.                                       |
| Palette and imagery | Deep green shadows and warm agricultural imagery match the concept. Harvest, transport and market are intentional additions requested by the user.                                            |
| Framing             | Fixed an internal scroll caused by overflow:hidden on the hero; overflow:clip keeps the image, overlay and controls aligned. Mobile subject positions were adjusted separately.               |
| Controls            | Outlined header action and lime primary button retained. Scene navigation, pause/resume and scroll guidance are intentional functional additions.                                             |
| Downstream layout   | Open numbered feature strip, four-stage product tour, learning links, cooperative section, FAQ and closing band preserve the original section design direction.                               |
| Motion              | Replaced the initial timed slideshow with scroll-driven transitions as explicitly requested. Forward/backward scrolling and natural exit into the next section were manually verified.        |

Above-the-fold copy difference: the opening headline and core proposition remain. The user requested three additional narrative chapters, visible scene labels and scroll guidance. CTA labels remain contextual (Open workspace, Try farmer demo, or Sign in); the pause control is intentional. The concept's incidental extra eyebrow was not adopted. No fake metrics or partner endorsements were added.

## Validation

TypeScript and production Vite build pass. All 116 frontend unit tests pass. IAB checks cover desktop 1440x1100 and phone 390x844, scrolling through the scenes, backward scrolling, sample task completion/reopening, workflow tabs, FAQ expansion, pause/resume, direct scene selection, and mobile navigation. No horizontal overflow was observed. Automated end-to-end and PostgreSQL checks are also configured in the GitHub deployment workflow.

The existing main-bundle size warning remains (about 330 kB minified / 104 kB gzip). No animation library, video dependency, database migration or paid resource was added. The implementation was visually verified against the concept and the user's subsequent changes; no known material visual mismatch remains in the inspected states.
