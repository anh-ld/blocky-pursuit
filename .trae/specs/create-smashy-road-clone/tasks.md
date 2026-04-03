# Tasks

- [x] Task 1: Setup project and engine basics
  - [x] SubTask 1.1: Initialize Bun project and install dependencies (`three`, `cannon-es`, `vite` for bun bundling).
  - [x] SubTask 1.2: Create `index.html` and basic CSS for a full-screen canvas.
  - [x] SubTask 1.3: Set up `main.js` with Three.js scene, renderer, lighting, and an isometric camera.
  - [x] SubTask 1.4: Implement the core Game Loop with `requestAnimationFrame` and `cannon-es` physics step.

- [x] Task 2: Implement player vehicle and controls
  - [x] SubTask 2.1: Create a voxel-style car model using colorful Three.js BoxGeometries.
  - [x] SubTask 2.2: Integrate `cannon-es` physics for the car (rigid body, friction, arcade-style steering).
  - [x] SubTask 2.3: Add keyboard controls (A/D or Left/Right arrows) to steer the vehicle.
  - [x] SubTask 2.4: Make the camera smoothly follow the player's car.

- [x] Task 3: Procedural world generation
  - [x] SubTask 3.1: Create a `CityGenerator` class to manage world chunks.
  - [x] SubTask 3.2: Spawn ground tiles (roads, grass) and colorful blocky buildings.
  - [x] SubTask 3.3: Implement chunk loading/unloading based on the player's position to create an endless environment.

- [x] Task 4: Police AI and Chase Mechanics
  - [x] SubTask 4.1: Create Cop car entities with a voxel appearance (blue/white/red).
  - [x] SubTask 4.2: Implement simple follow AI that steers the cop cars toward the player.
  - [x] SubTask 4.3: Add spawning logic to generate cops just outside the camera view.
  - [x] SubTask 4.4: Add collision and trapping logic to detect when the player is immobilized.

- [x] Task 5: Game State and UI
  - [x] SubTask 5.1: Create a UI overlay for the Score (survival time) and a Start/Game Over screen.
  - [x] SubTask 5.2: Implement game state transitions (Start -> Playing -> Game Over -> Restart).
  - [x] SubTask 5.3: Polish lighting, shadows, and materials for a vibrant, pixelated look.

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 2]
