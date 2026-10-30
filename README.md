# Crackler

Video analysis for physics teaching, in the browser. Open a video of a moving object, calibrate the scale, mark the object frame by frame, and get a table of positions you can paste into a spreadsheet. Inspired by the desktop program Tracker (Open Source Physics), covering the core classroom workflow.

Built with vanilla JavaScript (ES modules), no build step and no dependencies. Fonts: Space Mono and Material Symbols from Google Fonts. Interface in Italian and English. Videos never leave the device.

Vibecoded with Claude, with <3.

**Status: all four phases complete.** Loading, clip settings, calibration with perspective, lens and camera-motion corrections, point masses, centre of mass, vectors and vector sums, tape, protractor and circle fitter, automatic tracking, custom columns with parameters, table, plots with slope, area and fits, project files, autosave, undo and redo. Phase 4 added analytic and dynamic particles (models to compare with the measurement), arrows, trails and labels on the video, and picture export.

## For students

1. **Open video** (or **Test clip**, a ball in free fall with a known g). The dialog shows how much memory the frames need; trim the clip or lower the width if it is over budget. Loading takes about as long as the video lasts and the tab must stay in front.
2. **Clip** tab: choose the first and last frame, the step, and the frame where t = 0.
3. **Calibration** tab: *Place stick* and click the two ends of something of known length, then type the length. Move the origin and turn the axes if you need to (for an inclined plane, *Along the stick*). Drag the handles in the *Calibrate* tool to adjust.
4. **Mark** the object in each frame. The next frame appears by itself. On a phone a magnifier shows above your finger: slide to fine-tune, lift to confirm.
5. **Tracks** tab: add more point masses (colour, marker, mass), show or hide each, and choose the smoothing for velocity and acceleration. Smoothing "none" uses plain differences between neighbouring points; larger values fit a parabola to the points within ± that many points, which hides noise but also quick real changes.
6. **Table** tab: choose columns (n, t, x, y, v<sub>x</sub>, v<sub>y</sub>, v, a<sub>x</sub>, a<sub>y</sub>, a, kinetic energy), click a row to go to its frame, copy it into a spreadsheet (decimal comma in Italian) or download a CSV.
7. **Plot** tab: any quantity against any other, up to four on the vertical axis, automatic or typed limits. Tap or drag over the plot to jump to that frame.
8. **Plot tools** (buttons under the plot):
   - **Slope**: *Tangent* (tap or drag on the plot: a straight line is fitted to the point and its neighbours; choose how many) or *Two points* (tap one, then the other, or drag between them). The value is shown with its unit, for example the slope of v<sub>y</sub>(t) in m/s².
   - **Area**: drag across the plot to choose a range. The shaded area between the curve and y = 0 is the trapezoid sum over the data points, with its unit: the area under v(t) is the displacement, in m.
   - **Fit**: linear, polynomial (degree 2–6), exponential, power law, or your own formula such as `A*exp(-k*x)` (x is the horizontal quantity, any other name is a parameter). *Automatic* finds the best values and shows the equation, R², the uncertainty of each parameter and its unit. *Manual sliders* lets you move the parameters yourself and watch R² change; *Fit starting from these values* then refines them. Drag across the plot first to fit only a range of points.
   - The tools treat the chosen series as y(x). With several series, pick one in the *Series* menu.
9. **Tracks** tab, more tools:
   - *Kinds of track:* **Centre of mass** (weighted by the masses of the point masses you pick; computed, nothing to click), **Vector** (click tail then head in each frame, or attach the tail to a point mass and click only the head; columns V<sub>x</sub>, V<sub>y</sub>, V, θ) and **Vector sum**.
   - **Automatic tracking:** mark the object once, set the pattern size, search distance and match threshold, press *Track*. It follows the pattern frame by frame (normalised cross-correlation, sub-pixel) and stops where the match is too weak; correct that point by hand and run again. The boxes show on the video while the section is open.
   - **Measuring tools:** tape (length), protractor (angle) and circle fitter (centre and radius of a circle through the points of a point mass, e.g. circular motion). Drag their points with the *Calibrate* tool. For an angle against time use a vector from the pivot to the object and plot its angle θ.
10. **Calibration** tab, corrections (each in a foldable section):
   - **Perspective:** click the four corners of a rectangle of known size lying in the plane of the motion, type its width and height. Coordinates are mapped by a homography to that plane. **It is valid only for motion in that plane**: anything moving towards the camera or in another plane is measured wrongly. Only the coordinates are corrected, never the video.
   - **Lens distortion:** radial model r<sub>d</sub> = r<sub>u</sub>(1 + k<sub>1</sub>r<sub>u</sub>² + k<sub>2</sub>r<sub>u</sub>⁴), with r in units of half the image diagonal. Type k<sub>1</sub>, k<sub>2</sub>, or click points along lines that should be straight and press *Estimate k₁*.
   - **Camera motion:** if the camera moved, mark something fixed in the scene with a point mass and choose it as the reference; a second reference also corrects rotation. The calibration lives at the chosen base frame.
11. **Table** tab → **Custom columns:** define parameters (name, value, unit) and columns from formulas, for example `0.5*m*v^2`. Formulas can use the quantities of the track (`t x y vx vy v ax ay a ek Vx Vy V Va`), parameters, earlier columns by name and other tracks as `x_B`. New columns appear in the table and in the plot's axis choices.
12. **Models** (Tracks tab → *Add* → Analytic particle or Dynamic particle):
   - **Analytic particle:** type x(t) and y(t), for example `x0 + v0*t` and `-0.5*g*t^2`. It is drawn on the video at the time of each frame, and appears in the table and plots like any track (velocity and acceleration are exact, not smoothed).
   - **Dynamic particle:** type the force components F<sub>x</sub>, F<sub>y</sub> (functions of `t x y vx vy m` and your parameters) and the initial values, choose **Euler** or **RK4**, and compare with a measured track in the plots. *Initial values from this track at this frame* copies position and velocity from a measured track. Examples (free fall, spring, fall with drag) fill in formulas and parameters. With a small step Euler and RK4 agree; with a large one Euler visibly drifts, which is a good lesson in itself.
   - Parameters are the ones of the Table tab (Custom columns): a parameter called `m` replaces the track's mass in the force formulas.
13. **Arrows, trails and labels** (Tracks tab → *Arrows, trails and labels*): velocity, acceleration and net force (m·a) arrows for point masses, centres of mass and model particles, with a size slider for each; trails (all or the last N frames); labels with the values. **Save picture** (also the camera button under the video) exports the current frame with all overlays as a PNG of about 1280 px, with an optional time stamp; handles and boxes are not included.
14. **Clip** tab → **Project**: save your points, calibration and settings as a small `.crackler.json` file (the video is not included). To continue later, load the project, then open the same video: the load dialog repeats the saved trim and size so frame numbers match.

Keys: arrows step (Shift: 10 frames), Space plays, Home and End jump, `M` mark, `C` calibrate, `V` move the view, `N` new track, `1`–`5` tabs, `+` `-` zoom, `F` fit the view, `G` save the frame as a picture, Del deletes the point, Esc cancels a point, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, Ctrl/Cmd+S saves the project, Ctrl/Cmd+O opens a video, `?` opens the help. Shortcuts live in `js/ui/shortcuts.js` (plus the arrows in `transport.js`). Mouse wheel zooms, right button drags; two fingers pinch and pan.

### Good footage
Fixed camera, object moving in a plane facing the camera, something of known length in that plane, good light (short shutter). Slow-motion clips work well.

## Run it locally

ES modules do not load from `file://`. Serve the folder:

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. Tests (Node 20 or newer, nothing to install):

```bash
npm test
```

## Publish with GitHub Pages

Settings → Pages → Build and deployment → Deploy from a branch → `main`, folder `/ (root)`. The `CNAME` file points to `crackler.matephis.com`.

## Developer guide

```
index.html          markup, dialogs
css/style.css       tokens, components, responsive layouts
js/
  main.js           entry point: language, theme, tabs, wiring
  state.js          state object, event bus (on/emit), actions
  i18n.js           ALL strings (it, en), t(), data-i18n markup translation
  mathtext.js       v_x, a_{xy}, m/s^2, \theta -> HTML, SVG, plain text, canvas
  frames.js         frame access layer: the only code that touches <video>
  frames-synthetic.js   same interface; free-fall ball with known g
  calibration.js    scale, origin, axes, y flip; pixel <-> world        (pure)
  derive.js         velocity, acceleration by local least squares        (pure)
  homography.js     4-point homography for perspective                   (pure)
  lens.js           radial lens model, k1 from straight lines            (pure)
  camera.js         camera-motion correction from reference marks        (pure)
  circle.js         circle fit, angle at a vertex                        (pure)
  autotrack.js      template matching (NCC, sub-pixel)                   (pure)
  custom.js         custom columns and parameters                        (pure)
  model.js          analytic and dynamic particles, Euler and RK4        (pure)
  measures.js       results of tape, protractor, circle fitter           (pure)
  fit.js            linear, polynomial, exp, power, custom fits; R², errors (pure)
  formula.js        safe formula parser for custom fits (no eval)        (pure)
  integrate.js      trapezoid area, two-point and tangent slope          (pure)
  units.js          unit algebra for results: m/s / s = m/s^2            (pure)
  linalg.js         solve and invert small systems                       (pure)
  quantities.js     labels, units, plot series for every quantity        (pure)
  plotmath.js       ticks, ranges, nearest point                         (pure)
  history.js        undo/redo over snapshots, coalescing                 (pure)
  project.js        project JSON: pack, parse, validate                  (pure)
  plot.js           canvas plot renderer
  clip.js           start/end/step, t = 0 frame, frame rate override    (pure)
  timing.js         timestamp analysis, memory estimate                  (pure)
  tracks.js         point-mass data model                                (pure)
  table.js          columns, rows, CSV / spreadsheet text                (pure)
  ui/               stage (draw, camera), pointer (touch, mouse), loupe,
                    transport, panels (clip, calibration, tracks, table, plot),
                    analysis (slope, area, fit tools on the plot), overlay (what is drawn
                    on the video, and the calibrate-tool handles), autotrack, autosave,
                    draw (drawing primitives), snapshot (PNG export), panel-overlay,
                    custom columns, loader, controls
test/               node --test, one file per module
```

Pure modules have no DOM and are tested in Node. `test/pipeline.test.js` runs the whole data path on the synthetic clip and checks that the fitted g comes out right.

### The frame source interface

`frames.js` and `frames-synthetic.js` expose the same members, so a WebCodecs implementation can replace the first:

| Member | Meaning |
|---|---|
| `probe(file)` | `{ duration, width, height, fps, fpsMeasured }` before loading |
| `createFrames().load(file, opts)` | `opts`: `start`, `end` (s), `maxWidth`, `step`, `budget` (bytes), `onProgress`, `signal` |
| `frameCount`, `fps`, `width`, `height` | of the loaded frames |
| `getFrame(n)` | `ImageBitmap` of frame n |
| `timeOf(n)` | real presentation time in seconds, first frame = 0 |
| `warnings` | `{ type: "duplicate" \| "dropped" \| "budget" \| "stalled", count, at }` |
| `dispose()` | free the memory |

Nothing else may use the `<video>` element for measurement; `video.currentTime` is never used to read a frame. Frames are captured while the video plays at reduced speed (`requestVideoFrameCallback`, real `mediaTime`). Gaps cause a slower retry (up to two), and anything left is reported, never interpolated.

### Derivatives

`derive.js` estimates v and a at each marked frame by fitting x(t) = c₀ + c₁Δt + c₂Δt² to the points within ±k (k = 1 is the central difference on an even grid, exact for parabolas on any grid). Real timestamps are used, so uneven spacing and missing marks are handled. At the ends the window is one-sided; with too few points the value is empty.

### The coordinate pipeline

`calibration.js` builds a mapper (`makeMapper(cal, tracks)`) used everywhere a pixel becomes a world coordinate:

1. camera motion: the point is moved back to the image of the base frame, using the reference marks (interpolated between marked frames);
2. lens: the point is undistorted (Newton on r_d = r_u(1 + k₁r_u² + k₂r_u⁴));
3. the metric plane: a uniform scale from the stick, or the homography of the perspective rectangle;
4. the origin and the rotated axes (y up unless inverted).

`unmap` is the exact inverse and is what draws centre of mass, vectors and circles back on the video. Tracks store pixels, so changing any correction later changes every derived number. Computed tracks (centre of mass, vector sum) combine members in world coordinates, which is what makes them right under perspective.

### Models

`model.js` compiles formulas with the same parser as custom columns. An analytic particle is evaluated at the clip time of each frame (velocity and acceleration by central differences of the formula with h = 1 ms). A dynamic particle integrates m a = F from the initial time in both directions with the chosen method; the step is at most the given dt (and never less than 1/400 000 of the span). RK4 error falls like dt⁴ and Euler's like dt (tests check the ratios), and Euler gains energy on an oscillator. A formula that blows up gives empty values from there on. Model tracks live in world coordinates, so camera, lens and perspective corrections do not touch them; they are drawn back on the video through the inverse of the calibration.

### Fits

`fit.js` solves linear and polynomial fits in closed form (x is scaled for conditioning) and everything else by Levenberg–Marquardt with a numerical Jacobian, starting from a log-linear guess for exponentials and power laws, or from the values you give for custom formulas. Parameter uncertainties come from the covariance s²(JᵀJ)⁻¹. R² = 1 − SSE/SST for every model, also in manual mode. Custom formulas are parsed by `formula.js` (a small recursive-descent parser compiled to closures, no `eval`); `log` is base 10, `ln` natural.

Noise matters: a velocity is already a derivative of noisy positions, and the slope of a velocity is a derivative of that. With quarter-pixel clicks on the test clip, a 7-point tangent on v<sub>y</sub>(t) is 4% off while a 21-point one is within 0.1%. Use smoothing and a wider tangent window for accelerations, or fit a line to v<sub>y</sub>(t).

### Sessions

When you load a video, a checkbox keeps it in the browser (IndexedDB) together with the analysis. The **Sessions** button lists them: open (the video is re-extracted with the same settings and the analysis applied), rename, delete. The analysis is saved about 1.5 s after each change. The browser decides the quota (the dialog shows it); the page asks for persistent storage so that it is not evicted under pressure, and clearing site data removes the sessions. `js/sessions.js` is the pure store (tested with an in-memory backend), `js/idb.js` the IndexedDB backend, `js/ui/sessions.js` the dialog.

### Autosave

While you work, the project is saved to the browser's `localStorage` about a second after each change (up to six videos, oldest dropped first; skipped for the built-in test clip). Entries are keyed by file name, size, duration and number of loaded frames. When you open the same video with the same load settings, an offer to restore appears; nothing is overwritten until you answer. The load dialog also fills in the trim and size you used last time for that file. Autosave is not a backup: save a project file to keep or share your work.

### Choosing frames

"Keep one frame in N" works by position in the video, not by arrival order: a frame the browser skipped still counts as a slot, so the kept frames do not shift (`createStrider` in `timing.js`).

### Phones

The tab row has a button to make the panel taller (the video shrinks); the plot then stays at the top while you scroll its controls.

### Undo and project files

Undo covers clip settings, calibration and tracks, as JSON snapshots (frames are never in the history). Changes that arrive in a stream (typing a number, dragging a slider) merge into one step. A project file stores frame numbers, so it also records how the video was trimmed and scaled; if the frame count differs when you open the video, the project is not applied.

### Coordinates

Pixels are image pixels (y down). `calibration.js` maps them to world coordinates (y up unless inverted). Tracks store pixels, so changing the calibration later changes all derived numbers.

## Limits

- Perspective correction is a flat-plane model. Lens correction is a two-term radial model estimated from straight lines, not a full camera calibration. Camera-motion correction handles shift (and rotation with a second reference), not zoom or tilt.
- Arrow lengths are relative (the longest arrow is a seventh of the picture, times the size slider), not in physical units; the values are in the labels.
- Template matching works on grey levels; it can lose objects that rotate a lot, change size fast, or are occluded. Check the result by playing the video with the marks shown.

- Frames are held uncompressed in memory (about 0.9 MB at 640×360). Defaults: 640 px width, 200 MB budget on phones, up to 800 MB on desktop; adjustable in the load dialog.
- Frame capture needs `requestVideoFrameCallback` (Chrome, Edge, Safari 15.4+, Firefox 132+) and a visible tab.
- Undo covers clip, calibration (including lens, perspective and camera settings), tracks, measuring tools, custom columns, smoothing and the fit/range on the plot, not the view (open tabs, plot axes). It starts afresh when you load another video.
- Autosave keeps work in this browser's storage (see above). It is per browser and device, and clearing site data removes it.

## License

MIT, see [LICENSE](LICENSE).
