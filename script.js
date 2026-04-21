// Game State
let game = new Chess();
let boardElement = document.getElementById('chessboard');
let moveHistoryElement = document.getElementById('move-history');
let turnIndicator = document.getElementById('turn-indicator');
let gameStatus = document.getElementById('game-status');
let capturedWhiteElement = document.getElementById('captured-white');
let capturedBlackElement = document.getElementById('captured-black');

// Modes: '1vc' (Player vs AI), 'cvc' (AI vs AI), 'online' (Player vs Player Online)
let currentMode = '1vc';
let playerColor = 'w'; // 'w' or 'b'
let selectedSquare = null;
let cvcInterval = null;

// PeerJS setup
let peer = null;
let conn = null;
let isHost = false;

// Piece mapping to FontAwesome classes
const pieceMap = {
    'p': 'fa-chess-pawn',
    'n': 'fa-chess-knight',
    'b': 'fa-chess-bishop',
    'r': 'fa-chess-rook',
    'q': 'fa-chess-queen',
    'k': 'fa-chess-king'
};

const pieceValues = {
    'p': 10,
    'n': 30,
    'b': 30,
    'r': 50,
    'q': 90,
    'k': 900
};

// UI Elements mapping
const ui = {
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
    btnReset: document.getElementById('btn-reset')
};

// Initialization
function init() {
    renderBoard();
    updateUI();
    setupEventListeners();
}

function renderBoard() {
    boardElement.innerHTML = '';
    
    // Reverse board if player is black
    const isReversed = playerColor === 'b';
    
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const displayRow = isReversed ? 7 - r : r;
            const displayCol = isReversed ? 7 - c : c;
            
            const squareIdx = r * 8 + c;
            const rank = 8 - displayRow;
            const file = String.fromCharCode(97 + displayCol);
            const squareName = file + rank;
            
            const squareDiv = document.createElement('div');
            squareDiv.className = `square ${(displayRow + displayCol) % 2 === 0 ? 'light' : 'dark'}`;
            squareDiv.dataset.square = squareName;
            
            const piece = game.get(squareName);
            if (piece) {
                const icon = document.createElement('i');
                icon.className = `fas ${pieceMap[piece.type]} piece ${piece.color === 'w' ? 'white' : 'black'}`;
                squareDiv.appendChild(icon);
            }
            
            squareDiv.addEventListener('click', () => handleSquareClick(squareName));
            boardElement.appendChild(squareDiv);
        }
    }
}

function handleSquareClick(squareName) {
    if (game.game_over()) return;
    
    // Check if it's player's turn
    if (currentMode === '1vc' && game.turn() !== playerColor) return;
    if (currentMode === 'online' && game.turn() !== playerColor) return;
    if (currentMode === 'cvc') return;

    if (selectedSquare) {
        // Try to make a move
        const move = game.move({
            from: selectedSquare,
            to: squareName,
            promotion: 'q' // Always promote to queen for simplicity
        });
        
        if (move) {
            // Valid move
            selectedSquare = null;
            finishMove(move);
        } else {
            // Invalid move, or selecting another piece
            const piece = game.get(squareName);
            if (piece && piece.color === game.turn()) {
                selectedSquare = squareName;
                renderHighlights();
            } else {
                selectedSquare = null;
                renderHighlights();
            }
        }
    } else {
        const piece = game.get(squareName);
        if (piece && piece.color === game.turn()) {
            selectedSquare = squareName;
            renderHighlights();
        }
    }
}

function finishMove(move) {
    updateUI();
    renderBoard();
    
    // Send move to peer if online
    if (currentMode === 'online' && conn && conn.open) {
        conn.send({ type: 'move', move: move.san });
    }
    
    // Check for game over
    if (game.game_over()) {
        handleGameOver();
        return;
    }
    
    // Trigger AI if playing against computer
    if (currentMode === '1vc' && game.turn() !== playerColor) {
        setTimeout(makeAIMove, 400);
    }
}

function renderHighlights() {
    renderBoard(); // reset board to clear highlights
    if (!selectedSquare) return;
    
    const squares = document.querySelectorAll('.square');
    squares.forEach(sq => {
        if (sq.dataset.square === selectedSquare) {
            sq.classList.add('selected');
        }
    });
    
    const moves = game.moves({ square: selectedSquare, verbose: true });
    moves.forEach(m => {
        const target = document.querySelector(`.square[data-square="${m.to}"]`);
        if (target) {
            target.classList.add('valid-move');
        }
    });
}

function updateCapturedPieces() {
    // A simple way to get captured pieces is to count the current board state vs initial
    const initialCounts = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const currentCounts = { w: {p:0, n:0, b:0, r:0, q:0}, b: {p:0, n:0, b:0, r:0, q:0} };
    
    // Scan board
    const SQUARES = game.SQUARES;
    for (let i = 0; i < SQUARES.length; i++) {
        const piece = game.get(SQUARES[i]);
        if (piece && piece.type !== 'k') {
            currentCounts[piece.color][piece.type]++;
        }
    }
    
    capturedWhiteElement.innerHTML = '';
    capturedBlackElement.innerHTML = '';
    
    // White pieces captured BY black (so white pieces missing)
    for (let type in initialCounts) {
        let missing = initialCounts[type] - currentCounts.w[type];
        for (let i = 0; i < missing; i++) {
            let icon = document.createElement('i');
            icon.className = `fas ${pieceMap[type]} white`;
            capturedBlackElement.appendChild(icon); // Black captured them
        }
    }
    
    // Black pieces captured BY white
    for (let type in initialCounts) {
        let missing = initialCounts[type] - currentCounts.b[type];
        for (let i = 0; i < missing; i++) {
            let icon = document.createElement('i');
            icon.className = `fas ${pieceMap[type]} black`;
            capturedWhiteElement.appendChild(icon); // White captured them
        }
    }
}

function updateUI() {
    // Update Turn Indicator
    if (game.turn() === 'w') {
        turnIndicator.textContent = "White's Turn";
        turnIndicator.className = 'glow-text-cyan';
    } else {
        turnIndicator.textContent = "Black's Turn";
        turnIndicator.className = 'glow-text-pink';
    }
    
    // Move History
    moveHistoryElement.innerHTML = '';
    const history = game.history();
    for (let i = 0; i < history.length; i += 2) {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
            <span>${(i/2) + 1}</span>
            <span>${history[i]}</span>
            <span>${history[i+1] || ''}</span>
        `;
        moveHistoryElement.appendChild(row);
    }
    moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
    
    updateCapturedPieces();
}

function handleGameOver() {
    if (game.in_checkmate()) {
        gameStatus.textContent = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
    } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
        gameStatus.textContent = "Draw!";
    }
}

// Evaluate board for AI (very simple material evaluation)
function evaluateBoard(gameObj) {
    let totalEvaluation = 0;
    const SQUARES = gameObj.SQUARES;
    for (let i = 0; i < SQUARES.length; i++) {
        const piece = gameObj.get(SQUARES[i]);
        if (piece) {
            const val = pieceValues[piece.type];
            totalEvaluation += piece.color === 'w' ? val : -val;
        }
    }
    return totalEvaluation;
}

// Minimax with Alpha-Beta pruning (Depth 2 for performance)
function minimax(gameObj, depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0 || gameObj.game_over()) {
        return evaluateBoard(gameObj);
    }

    const moves = gameObj.moves();

    if (isMaximizingPlayer) {
        let bestVal = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            gameObj.move(moves[i]);
            bestVal = Math.max(bestVal, minimax(gameObj, depth - 1, alpha, beta, !isMaximizingPlayer));
            gameObj.undo();
            alpha = Math.max(alpha, bestVal);
            if (beta <= alpha) break;
        }
        return bestVal;
    } else {
        let bestVal = Infinity;
        for (let i = 0; i < moves.length; i++) {
            gameObj.move(moves[i]);
            bestVal = Math.min(bestVal, minimax(gameObj, depth - 1, alpha, beta, !isMaximizingPlayer));
            gameObj.undo();
            beta = Math.min(beta, bestVal);
            if (beta <= alpha) break;
        }
        return bestVal;
    }
}

function getBestMove() {
    const moves = game.moves();
    let bestMove = null;
    let bestValue = game.turn() === 'w' ? -Infinity : Infinity;
    
    // Slight randomness to avoid identical games
    moves.sort(() => Math.random() - 0.5);

    for (let i = 0; i < moves.length; i++) {
        game.move(moves[i]);
        const boardValue = minimax(game, 2, -Infinity, Infinity, game.turn() === 'w');
        game.undo();
        
        if (game.turn() === 'w') {
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

// AI Move Execution
function makeAIMove() {
    if (game.game_over()) return;
    
    // If we're early game, just pick random to be fast, else minimax
    let chosenMove = getBestMove();
    
    game.move(chosenMove);
    finishMove({ san: chosenMove });
}

// Event Listeners for UI
function setupEventListeners() {
    ui.btn1vc.addEventListener('click', () => setMode('1vc'));
    ui.btnCvc.addEventListener('click', () => setMode('cvc'));
    ui.btnOnline.addEventListener('click', () => setMode('online'));
    
    ui.btnReset.addEventListener('click', () => {
        game.reset();
        selectedSquare = null;
        if (cvcInterval) clearInterval(cvcInterval);
        gameStatus.textContent = '';
        renderBoard();
        updateUI();
        if (currentMode === 'cvc') startCvc();
        if (currentMode === 'online' && conn && conn.open) {
            conn.send({ type: 'reset' });
        }
    });
    
    ui.btnRedo.addEventListener('click', () => {
        if (currentMode === 'online') return; // no redo in online
        if (currentMode === '1vc') {
            game.undo(); // undo AI move
            game.undo(); // undo player move
        } else {
            game.undo();
        }
        renderBoard();
        updateUI();
    });
    
    ui.btnHint.addEventListener('click', () => {
        if (game.turn() === playerColor || currentMode === '1vc') {
            makeAIMove(); // AI makes a move for the player
        }
    });

    // PeerJS logic
    ui.btnConnect.addEventListener('click', () => {
        const friendId = ui.peerIdInput.value;
        if (friendId) {
            connectToPeer(friendId);
        }
    });
}

function setMode(mode) {
    currentMode = mode;
    ui.btn1vc.classList.remove('active');
    ui.btnCvc.classList.remove('active');
    ui.btnOnline.classList.remove('active');
    ui.onlineControls.classList.add('hidden');
    
    if (cvcInterval) clearInterval(cvcInterval);
    game.reset();
    selectedSquare = null;
    gameStatus.textContent = '';
    
    if (mode === '1vc') {
        ui.btn1vc.classList.add('active');
        playerColor = 'w'; // Default player to white
    } else if (mode === 'cvc') {
        ui.btnCvc.classList.add('active');
        startCvc();
    } else if (mode === 'online') {
        ui.btnOnline.classList.add('active');
        ui.onlineControls.classList.remove('hidden');
        setupPeer();
    }
    renderBoard();
    updateUI();
}

function startCvc() {
    cvcInterval = setInterval(() => {
        if (game.game_over()) {
            clearInterval(cvcInterval);
            return;
        }
        makeAIMove();
    }, 1000);
}

// PeerJS Networking
function setupPeer() {
    if (peer) return;
    
    ui.myId.textContent = "Generating...";
    peer = new Peer();
    
    peer.on('open', (id) => {
        ui.myId.textContent = id;
    });
    
    peer.on('connection', (connection) => {
        conn = connection;
        isHost = true;
        playerColor = 'w'; // Host plays white
        setupConnection();
    });
}

function connectToPeer(id) {
    if (!peer) setupPeer();
    conn = peer.connect(id);
    isHost = false;
    playerColor = 'b'; // Guest plays black
    setupConnection();
}

function setupConnection() {
    conn.on('open', () => {
        ui.connStatus.textContent = "Connected! " + (isHost ? "You are White." : "You are Black.");
        game.reset();
        renderBoard();
        updateUI();
    });
    
    conn.on('data', (data) => {
        if (data.type === 'move') {
            game.move(data.move);
            renderBoard();
            updateUI();
            if (game.game_over()) handleGameOver();
        } else if (data.type === 'reset') {
            game.reset();
            renderBoard();
            updateUI();
            gameStatus.textContent = '';
        }
    });
    
    conn.on('close', () => {
        ui.connStatus.textContent = "Disconnected.";
    });
}

// Initialize on load
init();
