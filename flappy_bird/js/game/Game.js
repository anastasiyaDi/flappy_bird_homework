import { CONFIG } from '../config/constants.js';
import { Bird } from '../entities/Bird.js';
import { Pipe } from '../entities/Pipe.js';
import { PhysicsEngine } from '../physics/PhysicsEngine.js';
import { Renderer } from '../render/Renderer.js';
import { AudioManager } from '../audio/AudioManager.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderer = new Renderer(this.ctx);
        this.physics = new PhysicsEngine();
        this.audio = new AudioManager();

        // Игровые объекты
        this.bird = null;
        this.pipes = [];

        // Состояние игры
        this.score = 0;
        this.bestScore = 0;
        this.isRunning = false;
        this.gameOver = false;

        // Время и анимация
        this.lastPipeTime = 0;
        this.animationId = null;
        this.lastTimestamp = 0;
        this.groundOffset = 0;

        // Границы игры
        this.bounds = {
            top: 0,
            bottom: CONFIG.CANVAS.HEIGHT - CONFIG.ENVIRONMENT.GROUND_HEIGHT
        };

        // Земля
        this.ground = {
            x: 0,
            y: CONFIG.CANVAS.HEIGHT - CONFIG.ENVIRONMENT.GROUND_HEIGHT,
            width: CONFIG.CANVAS.WIDTH,
            height: CONFIG.ENVIRONMENT.GROUND_HEIGHT
        };

        this.loadBestScore();
        this.init();
    }

    loadBestScore() {
        const savedScore = localStorage.getItem('flappyBirdBestScore');
        this.bestScore = savedScore ? parseInt(savedScore) : 0;
        this.updateScoreDisplay();
    }

    init() {
        // Создаем птицу в центре экрана
        const startX = Math.floor(CONFIG.CANVAS.WIDTH / 2 - CONFIG.BIRD.WIDTH / 2);
        const startY = Math.floor(
            (CONFIG.CANVAS.HEIGHT - CONFIG.ENVIRONMENT.GROUND_HEIGHT) / 2
            - CONFIG.BIRD.HEIGHT / 2
            + 30 // ↓ немного ниже центра
            );


        this.bird = new Bird(startX, startY);
        this.bird.velocity = 0;


        // Сбрасываем состояние игры
        this.pipes = [];
        this.score = 0;
        this.isRunning = false;
        this.gameOver = false;
        this.lastPipeTime = 0;
        this.groundOffset = 0;

        this.updateScoreDisplay();
       console.log('Game initialized - Bird at:', startX, startY);
    }

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.gameOver = false;
        this.lastTimestamp = performance.now();
        this.gameLoop();

        console.log('Game started');
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    gameLoop(timestamp) {
        if (!this.isRunning) return;

        // Вычисляем deltaTime для плавной анимации
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        // Обновляем игровое состояние
        this.update(deltaTime);

        // Отрисовываем кадр
        this.draw();

        // Запрашиваем следующий кадр
        this.animationId = requestAnimationFrame((ts) => this.gameLoop(ts));

        this.bird.update(this.physics, deltaTime);
        for (const pipe of this.pipes) {
            pipe.update(deltaTime);
            }
        this.checkCollisions();
    }

    update(deltaTime) {
        // Нормализуем deltaTime (примерно 16.67ms для 60fps)
        const normalizedDelta = deltaTime / 16.67;

        // Обновляем птицу
        this.bird.update(this.physics, normalizedDelta);

        // Прокручиваем землю
        this.groundOffset = (this.groundOffset - CONFIG.GAME.SCROLL_SPEED * normalizedDelta) % 50;

        // Обновляем трубы
        this.updatePipes(normalizedDelta);

        // Проверяем столкновения только если игра не окончена
        if (!this.gameOver) {
            this.checkCollisions();
            this.checkBounds();
        }
    }

    updatePipes(deltaTime) {
        const currentTime = Date.now();

        // Создаем новые трубы
        if (currentTime - this.lastPipeTime > CONFIG.GAME.PIPE_SPAWN_RATE) {
            this.createPipe();
            this.lastPipeTime = currentTime;
        }

        // Обновляем существующие трубы
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.update(deltaTime);

            // Проверяем, прошла ли птица трубу
            if (!pipe.passed && pipe.x + pipe.width < this.bird.x) {
                pipe.passed = true;
                this.addScore();
            }

            // Удаляем трубы за экраном
            if (pipe.isOffScreen()) {
                this.pipes.splice(i, 1);
            }
        }
    }

    createPipe() {
        // Вычисляем позицию промежутка между трубами
        const minGapY = 100;
        const maxGapY = CONFIG.CANVAS.HEIGHT - CONFIG.ENVIRONMENT.GROUND_HEIGHT - CONFIG.PIPE.GAP - 100;
        const gapY = minGapY + Math.random() * (maxGapY - minGapY);

        const pipe = new Pipe(CONFIG.CANVAS.WIDTH, gapY);
        this.pipes.push(pipe);

        console.log('New pipe created at y:', gapY);
    }

    checkCollisions() {
        const birdBounds = this.bird.getBounds();

        // Проверяем столкновение с землей
        if (this.physics.checkCollision(birdBounds, this.ground)) {
            console.log('Collision with ground!');
            this.endGame();
            return;
        }

        // Проверяем столкновение с трубами
        for (const pipe of this.pipes) {
            if (this.physics.checkPipeCollision(this.bird, pipe)) {
                console.log('Collision with pipe!');
                this.endGame();
                return;
            }
        }
    }

    checkBounds() {
        // Проверяем верхнюю границу
        if (this.bird.y < this.bounds.top) {
            this.bird.y = this.bounds.top;
            this.bird.velocity = Math.max(0, this.bird.velocity); // Не даем улететь вверх
        }

        // Проверяем нижнюю границу (столкновение с землей обрабатывается в checkCollisions)
        if (this.bird.y + this.bird.height > this.bounds.bottom) {
            this.bird.y = this.bounds.bottom - this.bird.height;
        }
    }

    addScore() {
        this.score++;
        this.audio.play('point');
        this.updateScoreDisplay();
        console.log('Score increased to:', this.score);
    }

    endGame() {
        this.audio.play('hit');
        this.gameOver = true;
        this.isRunning = false;

        // Обновляем лучший счет
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('flappyBirdBestScore', this.bestScore.toString());
            this.updateScoreDisplay();
        }

        console.log('Game over! Score:', this.score, 'Best:', this.bestScore);
    }

    draw() {
        // Очищаем canvas
        this.renderer.clear();

        // Рисуем фон
        this.renderer.drawBackground();

        // Рисуем трубы
        this.pipes.forEach(pipe => pipe.draw(this.renderer));

        // Рисуем землю
        this.renderer.drawGround(this.groundOffset);

        // Рисуем птицу
        this.bird.draw(this.renderer);

        // Рисуем интерфейс
        this.drawUI();
    }

    drawUI() {
        // Текущий счет (всегда виден во время игры)
        if (this.isRunning || this.score > 0) {
            this.renderer.drawText(
                this.score.toString(),
                CONFIG.CANVAS.WIDTH / 2,
                80,
                CONFIG.UI.TEXT_COLOR,
                CONFIG.UI.SCORE_SIZE
            );
        }

        // Экран начала игры
        if (!this.isRunning && this.score === 0 && !this.gameOver) {
            this.drawStartScreen();
        }

        // Экран окончания игры
        if (this.gameOver) {
            this.drawGameOverScreen();
        }
    }

    drawStartScreen() {
        this.renderer.drawText(
            'FLAPPY BIRD',
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 - 60,
            CONFIG.UI.TEXT_COLOR,
            36
        );

        this.renderer.drawText(
            'Кликни или нажми ПРОБЕЛ',
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2,
            CONFIG.UI.TEXT_COLOR,
            CONFIG.UI.TEXT_SIZE
        );

        this.renderer.drawText(
            `Лучший: ${this.bestScore}`,
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 + 40,
            CONFIG.UI.TEXT_COLOR,
            CONFIG.UI.SMALL_TEXT_SIZE
        );
    }

    drawGameOverScreen() {
        // Полупрозрачный overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);

        this.renderer.drawText(
            'ИГРА ОКОНЧЕНА',
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 - 60,
            '#ff6b6b',
            32
        );

        this.renderer.drawText(
            `Счет: ${this.score}`,
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 - 20,
            CONFIG.UI.TEXT_COLOR,
            CONFIG.UI.TEXT_SIZE
        );

        this.renderer.drawText(
            `Лучший: ${this.bestScore}`,
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 + 10,
            CONFIG.UI.TEXT_COLOR,
            CONFIG.UI.TEXT_SIZE
        );

        this.renderer.drawText(
            'Кликни для рестарта',
            CONFIG.CANVAS.WIDTH / 2,
            CONFIG.CANVAS.HEIGHT / 2 + 50,
            CONFIG.UI.TEXT_COLOR,
            CONFIG.UI.SMALL_TEXT_SIZE
        );
    }

    updateScoreDisplay() {
        const currentScoreElement = document.getElementById('current-score');
        const bestScoreElement = document.getElementById('best-score');

        if (currentScoreElement) {
            currentScoreElement.textContent = this.score;
        }
        if (bestScoreElement) {
            bestScoreElement.textContent = this.bestScore;
        }
    }

    handleClick() {
        if (this.gameOver) {
            // Рестарт игры
            this.init();
            this.start();
        } else if (!this.isRunning) {
            // Начало игры
            this.start();
        }

        // Птица прыгает
        this.bird.jump();
        this.audio.play('flap');

        console.log('Bird jump! Velocity:', this.bird.velocity);
    }

    restart() {
        const startX = Math.floor(CONFIG.CANVAS.WIDTH / 2 - CONFIG.BIRD.WIDTH / 2);
        const startY = Math.floor(CONFIG.CANVAS.HEIGHT / 2 - CONFIG.BIRD.HEIGHT / 2);
        this.bird.x = startX;
        this.bird.y = startY;
        this.bird.velocity = 0;

        this.stop();
        this.init();
    }

    toggleSound() {
        const enabled = this.audio.toggle();
        return enabled;
    }

    // Метод для отладки - принудительное завершение игры
    debugEndGame() {
        this.endGame();
    }

    // Метод для отладки - добавление очков
    debugAddScore() {
        this.addScore();
    }

 }