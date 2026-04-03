# Smashy Road Clone Spec

## Why

The user wants to create a web-based clone of the popular game "Smashy Road". This will be an endless survival driving game where the player avoids police cars in a procedurally generated city. The game will feature a 3D voxel/blocky art style with colorful, simple, pixelated aesthetics.

## What Changes

- Initialize a new project using `bun` as the bundler.
- Set up a 3D game engine environment using `three.js` for rendering and `cannon-es` for physics.
- Implement an isometric camera that follows the player's vehicle.
- Create an arcade-style vehicle physics controller (acceleration, steering, drifting).
- Build a procedural city generator that creates roads, grass, and colorful blocky buildings dynamically.
- Implement AI-driven police cars that spawn outside the viewport and chase the player.
- Add a game loop that manages state (Start, Playing, Game Over) and tracks survival time as the score.

## Impact

- Affected specs: Core Game Engine, Procedural Generation, Vehicle Physics, AI.
- Affected code: New project setup in the root directory (currently empty).

## ADDED Requirements

### Requirement: 3D Voxel Engine Setup

The system SHALL provide a web-based 3D environment using Three.js, bundled via Bun, rendering a colorful blocky world.

#### Scenario: Game Initialization

- **WHEN** the user loads the page
- **THEN** the game initializes the Three.js scene, physics world, and displays the start screen.

### Requirement: Endless Driving Mechanics

The system SHALL procedurally generate city chunks (roads and buildings) as the player drives.

#### Scenario: Driving

- **WHEN** the player steers the car
- **THEN** the car moves with arcade physics, and new city chunks appear ahead while old ones are removed behind.

### Requirement: Police Chase

The system SHALL spawn police cars that actively pursue the player.

#### Scenario: Getting Caught

- **WHEN** a police car collides with the player and stops their movement
- **THEN** the game ends and displays the final survival score.
