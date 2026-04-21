class ChessApp {
    constructor() {
        this.game = new Chess();
        this.ui = new UIController(this);
        this.ai = new AIController(this);
        this.network = new NetworkManager(this);
        
        this.currentMode = '1vc';
        this.playerColor = 'w';
        this.selectedSquare = null;
        this.cvcInterval = null;
        
        this.init();
    }
    
    init() {
        this.ui.init();
        this.ui.setupEventListeners();
        this.ui.fullRender();
        this.ui.updateUI();
    }
    
    setMode(mode) {
        this.currentMode = mode;
        if (this.cvcInterval) clearInterval(this.cvcInterval);
        this.game.reset();
        this.selectedSquare = null;
        this.ui.clearGameStatus();
        
        if (mode === '1vc') {
            this.playerColor = 'w';
        } else if (mode === 'cvc') {
            this.startCvc();
        } else if (mode === 'online') {
            this.network.setupPeer();
        }
        
        this.ui.updateModeButtons();
        this.ui.fullRender();
        this.ui.updateUI();
    }
    
    startCvc() {
        this.cvcInterval = setInterval(() => {
            if (this.game.game_over()) {
                clearInterval(this.cvcInterval);
                return;
            }
            this.ai.makeMove();
        }, 1000);
    }
    
    handleSquareClick(squareName) {
        if (this.game.game_over()) return;
        if (this.currentMode === '1vc' && this.game.turn() !== this.playerColor) return;
        if (this.currentMode === 'online' && this.game.turn() !== this.playerColor) return;
        if (this.currentMode === 'cvc') return;

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
                    this.ui.renderHighlights();
                } else {
                    this.selectedSquare = null;
                    this.ui.renderHighlights();
                }
            }
        } else {
            const piece = this.game.get(squareName);
            if (piece && piece.color === this.game.turn()) {
                this.selectedSquare = squareName;
                this.ui.renderHighlights();
            }
        }
    }
    
    executeMove(moveObj) {
        this.game.move(moveObj);
        this.ui.animateMove(moveObj);
        this.ui.updateUI();
        
        if (this.currentMode === 'online') {
            this.network.sendMove(moveObj.san);
        }
        
        if (this.game.game_over()) {
            this.ui.handleGameOver();
            return;
        }
        
        if (this.currentMode === '1vc' && this.game.turn() !== this.playerColor) {
            setTimeout(() => this.ai.makeMove(), 400);
        }
    }
    
    resetGame() {
        this.game.reset();
        this.selectedSquare = null;
        if (this.cvcInterval) clearInterval(this.cvcInterval);
        this.ui.clearGameStatus();
        this.ui.fullRender();
        this.ui.updateUI();
        if (this.currentMode === 'cvc') this.startCvc();
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
        this.boardElement.style.position = 'relative'; // Ensure pieces absolute positioning works
    }
    
    setupEventListeners() {
        this.els.btn1vc.addEventListener('click', () => this.app.setMode('1vc'));
        this.els.btnCvc.addEventListener('click', () => this.app.setMode('cvc'));
        this.els.btnOnline.addEventListener('click', () => this.app.setMode('online'));
        
        this.els.btnReset.addEventListener('click', () => this.app.resetGame());
        this.els.btnRedo.addEventListener('click', () => this.app.redoMove());
        this.els.btnHint.addEventListener('click', () => {
            if (this.app.game.turn() === this.app.playerColor || this.app.currentMode === '1vc') {
                this.app.ai.makeMove();
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
        
        // Render squares
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
        
        // Render Pieces
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
        if (move.flags.includes('e')) {
            const capturedSq = move.to[0] + move.from[1];
            if (this.pieces[capturedSq]) {
                this.pieces[capturedSq].remove();
                delete this.pieces[capturedSq];
            }
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
            row.innerHTML = `<span>${(i/2) + 1}</span><span>${history[i]}</span><span>${history[i+1] || ''}</span>`;
            this.els.moveHistory.appendChild(row);
        }
        this.els.moveHistory.scrollTop = this.els.moveHistory.scrollHeight;
        
        this.updateCapturedPieces();
    }
    
    updateCapturedPieces() {
        const initialCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        const currentCounts = { w: {p:0, n:0, b:0, r:0, q:0}, b: {p:0, n:0, b:0, r:0, q:0} };
        
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
    
    handleGameOver() {
        if (this.app.game.in_checkmate()) {
            this.els.gameStatus.textContent = `Checkmate! ${this.app.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
        } else if (this.app.game.in_draw() || this.app.game.in_stalemate() || this.app.game.in_threefold_repetition()) {
            this.els.gameStatus.textContent = "Draw!";
        }
    }
    
    clearGameStatus() {
        this.els.gameStatus.textContent = '';
    }
}

class AIController {
    constructor(app) {
        this.app = app;
        this.pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };
    }
    
    evaluateBoard(gameObj) {
        let totalEvaluation = 0;
        const SQUARES = gameObj.SQUARES;
        for (let i = 0; i < SQUARES.length; i++) {
            const piece = gameObj.get(SQUARES[i]);
            if (piece) {
                const val = this.pieceValues[piece.type];
                totalEvaluation += piece.color === 'w' ? val : -val;
            }
        }
        return totalEvaluation;
    }
    
    minimax(gameObj, depth, alpha, beta, isMaximizingPlayer) {
        if (depth === 0 || gameObj.game_over()) return this.evaluateBoard(gameObj);

        const moves = gameObj.moves();
        if (isMaximizingPlayer) {
            let bestVal = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                gameObj.move(moves[i]);
                bestVal = Math.max(bestVal, this.minimax(gameObj, depth - 1, alpha, beta, !isMaximizingPlayer));
                gameObj.undo();
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        } else {
            let bestVal = Infinity;
            for (let i = 0; i < moves.length; i++) {
                gameObj.move(moves[i]);
                bestVal = Math.min(bestVal, this.minimax(gameObj, depth - 1, alpha, beta, !isMaximizingPlayer));
                gameObj.undo();
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        }
    }
    
    getBestMove() {
        const moves = this.app.game.moves({ verbose: true });
        let bestMove = null;
        let bestValue = this.app.game.turn() === 'w' ? -Infinity : Infinity;
        
        moves.sort(() => Math.random() - 0.5);

        for (let i = 0; i < moves.length; i++) {
            this.app.game.move(moves[i]);
            const boardValue = this.minimax(this.app.game, 2, -Infinity, Infinity, this.app.game.turn() === 'w');
            this.app.game.undo();
            
            if (this.app.game.turn() === 'w') {
                if (boardValue > bestValue) {
                    bestValue = boardValue;
                    bestMove = moves[i];
                }
            } else {
                if (boardValue < bestValue) {
                    bestValue = boardValue;
                    bestMove = moves[i];
                }
            }
        }
        return bestMove || moves[0];
    }
    
    makeMove() {
        if (this.app.game.game_over()) return;
        const chosenMove = this.getBestMove();
        this.app.executeMove(chosenMove);
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
                const moveObj = this.app.game.move(data.move); // need verbose move
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

// Initialize on load
const app = new ChessApp();
