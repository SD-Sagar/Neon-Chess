class ChessApp {
    constructor() {
        this.game = new Chess();
        this.audio = new AudioController();
        this.ui = new UIController(this);
        this.ai = new AIController(this);
        this.network = new NetworkManager(this);

        this.currentMode = '1vc';
        this.playerColor = 'w';
        this.selectedSquare = null;

        this.init();
    }

    init() {
        this.ui.init();
        this.ui.setupEventListeners();
        this.ui.fullRender();
        this.ui.updateUI();
        this.setupModals();
    }

    setupModals() {
        const welcomeModal = document.getElementById('welcome-modal');
        const btnContinue = document.getElementById('btn-continue');

        btnContinue.addEventListener('click', () => {
            welcomeModal.classList.add('hidden');
            this.audio.playBgMusic();
        });

        // The Review Board button clears the timer and hides the modal so the user can look at the board
        document.getElementById('btn-review-board').addEventListener('click', () => {
            if (this.ui.countdownInterval) clearInterval(this.ui.countdownInterval);
            document.getElementById('game-over-modal').classList.add('hidden');
            // The user can now see the board. To restart, they use the sidebar "Reset Game" button.
        });

        // Fallback standard play again button (currently hidden in UI)
        document.getElementById('btn-play-again').addEventListener('click', () => {
            document.getElementById('game-over-modal').classList.add('hidden');
            this.resetGame();
        });
    }

    setMode(mode) {
        this.currentMode = mode;
        this.game.reset();
        this.selectedSquare = null;
        this.ui.clearGameStatus();

        if (mode === '1vc') {
            this.playerColor = 'w';
        } else if (mode === 'cvc') {
            // Initiate the AI vs AI loop
            setTimeout(() => this.ai.makeMove(), 500);
        } else if (mode === 'online') {
            this.network.setupPeer();
        }

        this.ui.updateModeButtons();
        this.ui.fullRender();
        this.ui.updateUI();
    }

    handleSquareClick(squareName) {
        if (this.game.game_over()) return;
        if (this.currentMode === '1vc' && this.game.turn() !== this.playerColor) return;
        if (this.currentMode === 'online' && this.game.turn() !== this.playerColor) return;
        if (this.currentMode === 'cvc') return; // Prevent clicks during AI vs AI

        if (this.selectedSquare) {
            const moves = this.game.moves({ verbose: true });
            // Always promote to queen for simplicity
            const move = moves.find(m => m.from === this.selectedSquare && m.to === squareName && (!m.promotion || m.promotion === 'q'));

            if (move) {
                this.executeMove(move);
                this.selectedSquare = null;
                this.ui.renderHighlights();
            } else {
                const piece = this.game.get(squareName);
                if (piece && piece.color === this.game.turn()) {
                    this.selectedSquare = squareName;
                    this.audio.playSound('select');
                    this.ui.renderHighlights();
                } else {
                    this.selectedSquare = null;
                    this.ui.renderHighlights();
                    this.checkJuggleKing();
                }
            }
        } else {
            const piece = this.game.get(squareName);
            if (piece && piece.color === this.game.turn()) {
                this.selectedSquare = squareName;
                this.audio.playSound('select');
                this.ui.renderHighlights();
            } else {
                this.checkJuggleKing();
            }
        }
    }

    checkJuggleKing() {
        if (this.game.in_check()) {
            this.ui.juggleKing(this.game.turn());
        }
    }

    executeMove(moveObj) {
        this.game.move(moveObj);
        this.ui.animateMove(moveObj);
        this.ui.updateUI(); // Move history updates here

        if (this.currentMode === 'online') {
            this.network.sendMove(moveObj.san);
        }

        if (this.game.game_over()) {
            this.ui.handleGameOver();
            return;
        }

        if (this.game.in_check()) {
            this.audio.playSound('check');
        }

        // Chained triggering for AI ensures no overlapping intervals or desynced history
        if (this.currentMode === '1vc' && this.game.turn() !== this.playerColor) {
            setTimeout(() => this.ai.makeMove(), 400);
        } else if (this.currentMode === 'cvc') {
            setTimeout(() => this.ai.makeMove(), 400);
        }
    }

    resetGame() {
        if (this.ui.countdownInterval) clearInterval(this.ui.countdownInterval);
        document.getElementById('game-over-modal').classList.add('hidden');
        this.game.reset();
        this.selectedSquare = null;
        this.ui.clearGameStatus();
        this.ui.fullRender();
        this.ui.updateUI();

        if (this.currentMode === 'cvc') {
            setTimeout(() => this.ai.makeMove(), 500);
        }
        if (this.currentMode === 'online') this.network.sendReset();
    }

    redoMove() {
        if (this.currentMode === 'online') return;
        if (this.currentMode === '1vc') {
            this.game.undo();
            this.game.undo();
        } else {
            this.game.undo();
        }
        this.ui.fullRender();
        this.ui.updateUI();
    }
}

class UIController {
    constructor(app) {
        this.app = app;
        this.boardElement = document.getElementById('chessboard');
        this.pieceMap = {
            'p': 'fa-chess-pawn', 'n': 'fa-chess-knight', 'b': 'fa-chess-bishop',
            'r': 'fa-chess-rook', 'q': 'fa-chess-queen', 'k': 'fa-chess-king'
        };
        this.pieces = {};
        this.countdownInterval = null; // Store interval ID for game over modal

        this.els = {
            btn1vc: document.getElementById('btn-1vc'),
            btnCvc: document.getElementById('btn-cvc'),
            btnOnline: document.getElementById('btn-online'),
            onlineControls: document.getElementById('online-controls'),
            myId: document.getElementById('my-id'),
            peerIdInput: document.getElementById('peer-id-input'),
            btnConnect: document.getElementById('btn-connect'),
            connStatus: document.getElementById('connection-status'),
            btnRedo: document.getElementById('btn-redo'),
            btnHint: document.getElementById('btn-hint'),
            btnReset: document.getElementById('btn-reset'),
            moveHistory: document.getElementById('move-history'),
            turnIndicator: document.getElementById('turn-indicator'),
            gameStatus: document.getElementById('game-status'),
            capturedWhite: document.getElementById('captured-white'),
            capturedBlack: document.getElementById('captured-black')
        };
    }

    init() {
        this.boardElement.innerHTML = '';
        this.boardElement.style.position = 'relative';
    }

    setupEventListeners() {
        this.els.btn1vc.addEventListener('click', () => this.app.setMode('1vc'));
        this.els.btnCvc.addEventListener('click', () => this.app.setMode('cvc'));
        this.els.btnOnline.addEventListener('click', () => this.app.setMode('online'));

        this.els.btnReset.addEventListener('click', () => this.app.resetGame());
        this.els.btnRedo.addEventListener('click', () => this.app.redoMove());

        // Auto-Solve (Hint)
        this.els.btnHint.addEventListener('click', () => {
            if (this.app.currentMode === '1vc' && this.app.game.turn() === this.app.playerColor) {
                this.app.ai.makeMove(); // Let the AI play for the user
            }
        });

        this.els.btnConnect.addEventListener('click', () => {
            const friendId = this.els.peerIdInput.value;
            if (friendId) this.app.network.connectToPeer(friendId);
        });
    }

    updateModeButtons() {
        this.els.btn1vc.classList.remove('active');
        this.els.btnCvc.classList.remove('active');
        this.els.btnOnline.classList.remove('active');
        this.els.onlineControls.classList.add('hidden');

        if (this.app.currentMode === '1vc') this.els.btn1vc.classList.add('active');
        if (this.app.currentMode === 'cvc') this.els.btnCvc.classList.add('active');
        if (this.app.currentMode === 'online') {
            this.els.btnOnline.classList.add('active');
            this.els.onlineControls.classList.remove('hidden');
        }
    }

    getSquarePos(squareName) {
        const isReversed = this.app.playerColor === 'b';
        const file = squareName.charCodeAt(0) - 97;
        const rank = 8 - parseInt(squareName[1]);

        const displayCol = isReversed ? 7 - file : file;
        const displayRow = isReversed ? 7 - rank : rank;

        return { left: `${displayCol * 12.5}%`, top: `${displayRow * 12.5}%` };
    }

    createPiece(piece, squareName) {
        const icon = document.createElement('i');
        icon.className = `fas ${this.pieceMap[piece.type]} piece ${piece.color === 'w' ? 'white' : 'black'}`;
        const pos = this.getSquarePos(squareName);
        icon.style.left = pos.left;
        icon.style.top = pos.top;
        this.boardElement.appendChild(icon);
        this.pieces[squareName] = icon;
    }

    fullRender() {
        this.boardElement.innerHTML = '';
        this.pieces = {};

        const isReversed = this.app.playerColor === 'b';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const displayRow = isReversed ? 7 - r : r;
                const displayCol = isReversed ? 7 - c : c;
                const rank = 8 - displayRow;
                const file = String.fromCharCode(97 + displayCol);
                const squareName = file + rank;

                const squareDiv = document.createElement('div');
                squareDiv.className = `square ${(displayRow + displayCol) % 2 === 0 ? 'light' : 'dark'}`;
                squareDiv.dataset.square = squareName;
                squareDiv.addEventListener('click', () => this.app.handleSquareClick(squareName));
                this.boardElement.appendChild(squareDiv);
            }
        }

        const board = this.app.game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const squareName = String.fromCharCode(97 + c) + (8 - r);
                    this.createPiece(piece, squareName);
                }
            }
        }
        this.renderHighlights();
        this.updateA11y();
    }

    animateMove(move) {
        const pieceEl = this.pieces[move.from];
        if (!pieceEl) {
            this.fullRender();
            return;
        }

        if (this.pieces[move.to]) {
            this.pieces[move.to].remove();
        }

        let isCapture = false;
        if (move.flags.includes('c') || move.flags.includes('e')) {
            isCapture = true;
            const capturedSq = move.to[0] + (move.flags.includes('e') ? move.from[1] : move.to[1]);
            if (this.pieces[capturedSq]) {
                this.pieces[capturedSq].remove();
                delete this.pieces[capturedSq];
            }
        }

        if (isCapture) {
            this.app.audio.playSound('knock');
        } else {
            this.app.audio.playSound('drop');
        }

        const targetPos = this.getSquarePos(move.to);
        pieceEl.style.left = targetPos.left;
        pieceEl.style.top = targetPos.top;
        this.pieces[move.to] = pieceEl;
        delete this.pieces[move.from];

        if (move.promotion) {
            pieceEl.className = `fas ${this.pieceMap[move.promotion]} piece ${move.color === 'w' ? 'white' : 'black'}`;
        }

        if (move.flags.includes('k') || move.flags.includes('q')) {
            const rank = move.color === 'w' ? '1' : '8';
            let rookFrom, rookTo;
            if (move.flags.includes('k')) {
                rookFrom = 'h' + rank; rookTo = 'f' + rank;
            } else {
                rookFrom = 'a' + rank; rookTo = 'd' + rank;
            }
            const rookEl = this.pieces[rookFrom];
            if (rookEl) {
                const rookTargetPos = this.getSquarePos(rookTo);
                rookEl.style.left = rookTargetPos.left;
                rookEl.style.top = rookTargetPos.top;
                this.pieces[rookTo] = rookEl;
                delete this.pieces[rookFrom];
            }
        }

        this.renderHighlights();
        this.updateA11y();
    }

    updateA11y() {
        const squares = document.querySelectorAll('.square');
        const board = this.app.game.board();

        squares.forEach(sq => {
            const sqName = sq.dataset.square;
            const file = sqName.charCodeAt(0) - 97;
            const rank = 8 - parseInt(sqName[1]);
            const piece = board[rank][file];

            sq.classList.remove('in-check');

            if (piece) {
                const color = piece.color === 'w' ? 'White' : 'Black';
                const typeName = piece.type === 'p' ? 'Pawn' : piece.type === 'n' ? 'Knight' : piece.type === 'b' ? 'Bishop' : piece.type === 'r' ? 'Rook' : piece.type === 'q' ? 'Queen' : 'King';
                sq.setAttribute('aria-label', `${sqName}, ${color} ${typeName}`);

                if (piece.type === 'k' && piece.color === this.app.game.turn() && this.app.game.in_check()) {
                    sq.classList.add('in-check');
                }
            } else {
                sq.setAttribute('aria-label', `${sqName}, empty`);
            }
        });
    }

    renderHighlights() {
        document.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('selected', 'valid-move', 'capture-move');
            if (sq.dataset.square === this.app.selectedSquare) {
                sq.classList.add('selected');
            }
        });

        if (this.app.selectedSquare) {
            const moves = this.app.game.moves({ square: this.app.selectedSquare, verbose: true });
            moves.forEach(m => {
                const target = document.querySelector(`.square[data-square="${m.to}"]`);
                if (target) {
                    if (m.flags.includes('c') || m.flags.includes('e')) {
                        target.classList.add('capture-move');
                    } else {
                        target.classList.add('valid-move');
                    }
                }
            });
        }
    }

    updateUI() {
        if (this.app.game.turn() === 'w') {
            this.els.turnIndicator.textContent = "White's Turn";
            this.els.turnIndicator.className = 'glow-text-cyan';
        } else {
            this.els.turnIndicator.textContent = "Black's Turn";
            this.els.turnIndicator.className = 'glow-text-pink';
        }

        this.els.moveHistory.innerHTML = '';
        const history = this.app.game.history();
        for (let i = 0; i < history.length; i += 2) {
            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `<span>${(i / 2) + 1}</span><span>${history[i]}</span><span>${history[i + 1] || ''}</span>`;
            this.els.moveHistory.appendChild(row);
        }
        this.els.moveHistory.scrollTop = this.els.moveHistory.scrollHeight;

        this.updateCapturedPieces();
    }

    updateCapturedPieces() {
        const initialCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        const currentCounts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

        const SQUARES = this.app.game.SQUARES;
        for (let i = 0; i < SQUARES.length; i++) {
            const piece = this.app.game.get(SQUARES[i]);
            if (piece && piece.type !== 'k') {
                currentCounts[piece.color][piece.type]++;
            }
        }

        this.els.capturedWhite.innerHTML = '';
        this.els.capturedBlack.innerHTML = '';

        for (let type in initialCounts) {
            let missing = initialCounts[type] - currentCounts.w[type];
            for (let i = 0; i < missing; i++) {
                let icon = document.createElement('i');
                icon.className = `fas ${this.pieceMap[type]} white`;
                this.els.capturedBlack.appendChild(icon);
            }
        }

        for (let type in initialCounts) {
            let missing = initialCounts[type] - currentCounts.b[type];
            for (let i = 0; i < missing; i++) {
                let icon = document.createElement('i');
                icon.className = `fas ${this.pieceMap[type]} black`;
                this.els.capturedWhite.appendChild(icon);
            }
        }
    }

    juggleKing(color) {
        const board = this.app.game.board();
        let kingSq = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === color) {
                    kingSq = String.fromCharCode(97 + c) + (8 - r);
                    break;
                }
            }
        }
        if (kingSq && this.pieces[kingSq]) {
            const kingEl = this.pieces[kingSq];
            kingEl.classList.remove('juggle-glow');
            void kingEl.offsetWidth;
            kingEl.classList.add('juggle-glow');
            setTimeout(() => {
                kingEl.classList.remove('juggle-glow');
            }, 500);
        }
    }

    handleGameOver() {
        let message = "";
        let winner = "";
        if (this.app.game.in_checkmate()) {
            winner = this.app.game.turn() === 'w' ? 'Black' : 'White';
            message = `Checkmate! ${winner} wins.`;
        } else if (this.app.game.in_draw() || this.app.game.in_stalemate() || this.app.game.in_threefold_repetition()) {
            message = "Draw!";
        }

        this.els.gameStatus.textContent = message;

        const modal = document.getElementById('game-over-modal');
        const msgEl = document.getElementById('game-over-message');
        const countdownEl = document.getElementById('countdown-timer');

        msgEl.textContent = message;
        modal.classList.remove('hidden');

        this.app.audio.playSound('conclusion');

        // Setup 5 second countdown timer
        let timeLeft = 5;
        countdownEl.textContent = timeLeft;

        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                countdownEl.textContent = timeLeft;
            } else {
                clearInterval(this.countdownInterval);
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    this.app.resetGame();
                }
            }
        }, 1000);
    }

    clearGameStatus() {
        this.els.gameStatus.textContent = '';
    }
}

// --------------------------------------------------------------------
// THE NEW, HIGHLY ROBUST CHESS ENGINE
// --------------------------------------------------------------------
class AIController {
    constructor(app) {
        this.app = app;

        // Accurate piece valuation
        this.pieceValues = {
            'p': 100,
            'n': 320,
            'b': 330,
            'r': 500,
            'q': 900,
            'k': 20000
        };

        // Piece-Square Tables (PST) to encourage strategic positioning
        this.pst = {
            'p': [
                [0, 0, 0, 0, 0, 0, 0, 0],
                [50, 50, 50, 50, 50, 50, 50, 50],
                [10, 10, 20, 30, 30, 20, 10, 10],
                [5, 5, 10, 25, 25, 10, 5, 5],
                [0, 0, 0, 20, 20, 0, 0, 0],
                [5, -5, -10, 0, 0, -10, -5, 5],
                [5, 10, 10, -20, -20, 10, 10, 5],
                [0, 0, 0, 0, 0, 0, 0, 0]
            ],
            'n': [
                [-50, -40, -30, -30, -30, -30, -40, -50],
                [-40, -20, 0, 0, 0, 0, -20, -40],
                [-30, 0, 10, 15, 15, 10, 0, -30],
                [-30, 5, 15, 20, 20, 15, 5, -30],
                [-30, 0, 15, 20, 20, 15, 0, -30],
                [-30, 5, 10, 15, 15, 10, 5, -30],
                [-40, -20, 0, 5, 5, 0, -20, -40],
                [-50, -40, -30, -30, -30, -30, -40, -50]
            ],
            'b': [
                [-20, -10, -10, -10, -10, -10, -10, -20],
                [-10, 0, 0, 0, 0, 0, 0, -10],
                [-10, 0, 5, 10, 10, 5, 0, -10],
                [-10, 5, 5, 10, 10, 5, 5, -10],
                [-10, 0, 10, 10, 10, 10, 0, -10],
                [-10, 10, 10, 10, 10, 10, 10, -10],
                [-10, 5, 0, 0, 0, 0, 5, -10],
                [-20, -10, -10, -10, -10, -10, -10, -20]
            ],
            'r': [
                [0, 0, 0, 0, 0, 0, 0, 0],
                [5, 10, 10, 10, 10, 10, 10, 5],
                [-5, 0, 0, 0, 0, 0, 0, -5],
                [-5, 0, 0, 0, 0, 0, 0, -5],
                [-5, 0, 0, 0, 0, 0, 0, -5],
                [-5, 0, 0, 0, 0, 0, 0, -5],
                [-5, 0, 0, 0, 0, 0, 0, -5],
                [0, 0, 0, 5, 5, 0, 0, 0]
            ],
            'q': [
                [-20, -10, -10, -5, -5, -10, -10, -20],
                [-10, 0, 0, 0, 0, 0, 0, -10],
                [-10, 0, 5, 5, 5, 5, 0, -10],
                [-5, 0, 5, 5, 5, 5, 0, -5],
                [0, 0, 5, 5, 5, 5, 0, -5],
                [-10, 5, 5, 5, 5, 5, 0, -10],
                [-10, 0, 5, 0, 0, 0, 0, -10],
                [-20, -10, -10, -5, -5, -10, -10, -20]
            ],
            'k_mid': [
                [-30, -40, -40, -50, -50, -40, -40, -30],
                [-30, -40, -40, -50, -50, -40, -40, -30],
                [-30, -40, -40, -50, -50, -40, -40, -30],
                [-30, -40, -40, -50, -50, -40, -40, -30],
                [-20, -30, -30, -40, -40, -30, -30, -20],
                [-10, -20, -20, -20, -20, -20, -20, -10],
                [20, 20, 0, 0, 0, 0, 20, 20],
                [20, 30, 10, 0, 0, 10, 30, 20]
            ],
            'k_end': [
                [-50, -40, -30, -20, -20, -30, -40, -50],
                [-30, -20, -10, 0, 0, -10, -20, -30],
                [-30, -10, 20, 30, 30, 20, -10, -30],
                [-30, -10, 30, 40, 40, 30, -10, -30],
                [-30, -10, 30, 40, 40, 30, -10, -30],
                [-30, -10, 20, 30, 30, 20, -10, -30],
                [-30, -30, 0, 0, 0, 0, -30, -30],
                [-50, -30, -30, -30, -30, -30, -30, -50]
            ]
        };
    }

    evaluateBoard(gameObj) {
        let totalEvaluation = 0;
        let whiteMaterialWithoutPawns = 0;
        let blackMaterialWithoutPawns = 0;

        // Fast loop to determine if we are in the endgame
        const SQUARES = gameObj.SQUARES;
        for (let i = 0; i < SQUARES.length; i++) {
            const piece = gameObj.get(SQUARES[i]);
            if (piece && piece.type !== 'k' && piece.type !== 'p') {
                if (piece.color === 'w') whiteMaterialWithoutPawns += this.pieceValues[piece.type];
                else blackMaterialWithoutPawns += this.pieceValues[piece.type];
            }
        }

        const isEndgame = (whiteMaterialWithoutPawns + blackMaterialWithoutPawns) < 1500;

        for (let i = 0; i < SQUARES.length; i++) {
            const sq = SQUARES[i];
            const piece = gameObj.get(sq);

            if (piece) {
                // Determine row/col for PST lookups
                const file = sq.charCodeAt(0) - 97;
                const rank = parseInt(sq[1]) - 1;

                // Flip table index for white/black
                const x = piece.color === 'w' ? 7 - rank : rank;
                const y = file;

                let pieceValue = this.pieceValues[piece.type];

                // Add positional bonus based on PST
                if (piece.type === 'k') {
                    pieceValue += isEndgame ? this.pst['k_end'][x][y] : this.pst['k_mid'][x][y];
                } else {
                    pieceValue += this.pst[piece.type][x][y];
                }

                totalEvaluation += piece.color === 'w' ? pieceValue : -pieceValue;
            }
        }

        return totalEvaluation;
    }

    // Orders moves to optimize Alpha-Beta Pruning (captures/promotions first)
    orderMoves(moves) {
        return moves.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            // Prioritize capturing high-value pieces with low-value attackers (MVV-LVA)
            if (a.captured) scoreA += 10 * this.pieceValues[a.captured] - this.pieceValues[a.piece];
            if (a.promotion) scoreA += this.pieceValues[a.promotion];

            if (b.captured) scoreB += 10 * this.pieceValues[b.captured] - this.pieceValues[b.piece];
            if (b.promotion) scoreB += this.pieceValues[b.promotion];

            return scoreB - scoreA;
        });
    }

    // Quiescence search stops the AI from blundering during piece exchanges
    quiescenceSearch(alpha, beta, colorMultiplier) {
        let standPat = this.evaluateBoard(this.app.game) * colorMultiplier;

        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;

        let moves = this.app.game.moves({ verbose: true });
        let captures = moves.filter(m => m.captured);
        captures = this.orderMoves(captures);

        for (let i = 0; i < captures.length; i++) {
            this.app.game.move(captures[i]);
            let score = -this.quiescenceSearch(-beta, -alpha, -colorMultiplier);
            this.app.game.undo();

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        return alpha;
    }

    // NegaMax algorithm with Alpha-Beta pruning
    negaMax(depth, alpha, beta, colorMultiplier) {
        if (this.app.game.in_checkmate()) return -99999 + (10 - depth); // Prefer fastest mate
        if (this.app.game.in_draw() || this.app.game.in_stalemate() || this.app.game.in_threefold_repetition() || this.app.game.insufficient_material()) return 0;

        if (depth === 0) return this.quiescenceSearch(alpha, beta, colorMultiplier);

        let moves = this.app.game.moves({ verbose: true });
        moves = this.orderMoves(moves);

        let maxScore = -Infinity;

        for (let i = 0; i < moves.length; i++) {
            this.app.game.move(moves[i]);
            let score = -this.negaMax(depth - 1, -beta, -alpha, -colorMultiplier);
            this.app.game.undo();

            if (score > maxScore) maxScore = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
        }
        return maxScore;
    }

    getBestMove() {
        const moves = this.app.game.moves({ verbose: true });
        const orderedMoves = this.orderMoves(moves);

        let bestMove = null;
        let bestValue = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;
        let colorMultiplier = this.app.game.turn() === 'w' ? 1 : -1;

        // Depth 3 is optimal for JavaScript browsers. 
        // With move ordering & Quiescence, it performs similarly to older depth 5+ engines.
        const searchDepth = 3;

        for (let i = 0; i < orderedMoves.length; i++) {
            this.app.game.move(orderedMoves[i]);
            let boardValue = -this.negaMax(searchDepth - 1, -beta, -alpha, -colorMultiplier);
            this.app.game.undo();

            if (boardValue > bestValue) {
                bestValue = boardValue;
                bestMove = orderedMoves[i];
            }
            if (boardValue > alpha) alpha = boardValue;
        }
        return bestMove || orderedMoves[0];
    }

    makeMove() {
        if (this.app.game.game_over()) return;

        // Minor timeout so UI doesn't visually lock up instantly
        setTimeout(() => {
            const chosenMove = this.getBestMove();
            this.app.executeMove(chosenMove);
        }, 50);
    }
}

class NetworkManager {
    constructor(app) {
        this.app = app;
        this.peer = null;
        this.conn = null;
        this.isHost = false;
    }

    setupPeer() {
        if (this.peer) return;
        this.app.ui.els.myId.textContent = "Generating...";
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.app.ui.els.myId.textContent = id;
        });

        this.peer.on('connection', (connection) => {
            this.conn = connection;
            this.isHost = true;
            this.app.playerColor = 'w';
            this.setupConnection();
        });
    }

    connectToPeer(id) {
        if (!this.peer) this.setupPeer();
        this.conn = this.peer.connect(id);
        this.isHost = false;
        this.app.playerColor = 'b';
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.app.ui.els.connStatus.textContent = "Connected! " + (this.isHost ? "You are White." : "You are Black.");
            this.app.game.reset();
            this.app.ui.fullRender();
            this.app.ui.updateUI();
        });

        this.conn.on('data', (data) => {
            if (data.type === 'move') {
                const moveObj = this.app.game.move(data.move);
                this.app.ui.animateMove(moveObj);
                this.app.ui.updateUI();
                if (this.app.game.game_over()) this.app.ui.handleGameOver();
            } else if (data.type === 'reset') {
                this.app.game.reset();
                this.app.ui.fullRender();
                this.app.ui.updateUI();
                this.app.ui.clearGameStatus();
            }
        });

        this.conn.on('close', () => {
            this.app.ui.els.connStatus.textContent = "Disconnected.";
        });
    }

    sendMove(san) {
        if (this.conn && this.conn.open) {
            this.conn.send({ type: 'move', move: san });
        }
    }

    sendReset() {
        if (this.conn && this.conn.open) {
            this.conn.send({ type: 'reset' });
        }
    }
}

class AudioController {
    constructor() {
        this.bgMusic = new Audio('assets/BackgroundMusic.mp3');
        this.bgMusic.volume = 0.35;

        this.bgMusic.addEventListener('timeupdate', () => {
            if (this.bgMusic.duration > 12 && this.bgMusic.currentTime >= this.bgMusic.duration - 11.5) {
                this.bgMusic.currentTime = 0;
            }
        });

        this.sounds = {
            conclusion: new Audio('assets/Conclutionsound.mp3'),
            check: new Audio('assets/check.mp3'),
            drop: new Audio('assets/drop.mp3'),
            knock: new Audio('assets/knock.mp3'),
            select: new Audio('assets/select.mp3')
        };
    }

    playBgMusic() {
        this.bgMusic.play().catch(e => console.log("Audio play failed:", e));
    }

    playSound(name) {
        if (this.sounds[name]) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(e => console.log("Audio play failed:", e));
        }
    }
}

// Initialize on load
const app = new ChessApp();