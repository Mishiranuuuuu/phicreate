# PhiCreate

PhiCreate is a browser-based fan-made Phigros chart editor, with support for all modern chart formats and features. It has features from the chart editor we all know and love.
<img width="1920" height="1080" alt="Screenshot 2026-10-17 191354" src="https://github.com/user-attachments/assets/c9f64e93-ac88-4d00-b984-c27138aae6bd" />
*Desultory Signals [AT18] from Phigros*

## Usage
Access it via GitHub pages:

All data is stored in the browser using IndexedDB. Please backup your data regularily.

## Features
PhiCreate can convert from/to the following formats. Note that data may be lost as some formats lack features.
- PhiCreate (custom chart format)
- Re:PhiEdit (RPE chart format)
- Official V3 (Phigros chart format)

PhiCreate does everything you would expect a chart editor to do. Below are some additional features.
- Noise field editing (block areas from Phigros 4.0.1+)
- Enhanced video support and preview (see below).
- File manager (add, replace, delete additional storyboarding files).
- Automatic conversion and event reconstruction when importing official-format charts.

## Similarities
Many aspects of PhiCreate are similar to existing applications for ease of use. Such as:
- Coordinate system (1350 by 900 canvas)
- Beat system (x : y / z)

## Differences
Object-based editing
- In Re:PhiEdit, media is added by changing a judgement line's texture. In PhiCreate, there are objects (judgement lines, media, shaders, text, noise fields). This improves organization.<br>

UI element handling
- In Re:PhiEdit, UI elements are controlled as if they were a judgement line. In PhiCreate, all UI elements are objects (text and media to be specific). All text-based UI elements (combo, combo text, score, name, difficulty) are variables that are reusable. In addition, as they are text objects, one can directly edit their values without creating a new text object, ensuring correct scaling.

## Disclaimers
1. This project is NOT endorsed by (or officially related to) Pigeon Games or Phigros in any way, shape, or form.

## Attribution
PhiCreate would not be possible without the following:
- [RPE-Next](https://github.com/kclg-YSJ/rpe-next) by [cmdysj](https://github.com/kclg-YSJ) (for RPE-Next format noise field documentation)
- [Phigros Docs](https://docs.chcat1320.top/knowladge/phigros) by [CHCAT1320](https://github.com/CHCAT1320) (for Phigros format noise field documentation)
- [PhiChain](https://github.com/Ivan-1F/phichain) by [Ivan-1F](https://github.com/Ivan-1F) (for converter logic)
- [Phira Docs](https://teamflos.github.io/phira-docs/chart-standard/chart-format) by [TeamFlos](https://github.com/TeamFlos) (for documentation about V3 and RPE formats)
- [sim-phi](https://github.com/lchzh3473/sim-phi) by [lchzh3473](https://github.com/lchzh3473) (for Phigros chart format documentation)