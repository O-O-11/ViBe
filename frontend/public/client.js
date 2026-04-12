// WebRTC 설정 (다중 STUN/TURN 서버 지원 - NAT/방화벽 돌파용)
const RTCConfig = {
    iceServers: [
        // Google STUN 서버 (기본)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // 공개 TURN 서버들 (NAT/방화벽 뚫기 위한 대체 경로)
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@example.com'
        },
        {
            urls: 'turn:turn.bistri.com:80',
            credential: 'homage',
            username: 'homage'
        }
    ]
};

// 백엔드 서버 URL 설정 (똑똑한 자동 감지)
function getBackendURL() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // 1️⃣ 로컬호스트 (내 컴퓨터)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    
    // 2️⃣ 같은 네트워크 내부 IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
        return `${protocol}//${hostname}:3000`;
    }
    
    // 3️⃣ 프로덕션 배포 (공개 인터넷)
    return 'https://vibe-production-6c36.up.railway.app';
}

const BACKEND_URL = getBackendURL();

// 디버그: BACKEND_URL 로깅
console.log(`🌐 Backend URL: ${BACKEND_URL} (hostname: ${window.location.hostname})`);
console.log(`🔒 Protocol: ${window.location.protocol}, Secure: ${window.location.protocol === 'https:' || window.location.hostname === 'localhost'}`);

// ✅ 보안 정책 감지 함수
function isSecureContext() {
    return window.location.protocol === 'https:' || 
           window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
}

// ✅ 카메라/마이크 권한 에러 핸들러
function handleMediaError(error, context = '') {
    console.error(`❌ 미디어 권한 오류 (${context}):`, error);
    
    let errorMsg = '카메라/마이크 접근 실패';
    
    if (error.name === 'NotAllowedError') {
        errorMsg = '카메라/마이크 권한이 거부되었습니다. 브라우저 설정을 확인해주세요';
    } else if (error.name === 'NotFoundError') {
        errorMsg = '카메라/마이크가 연결되지 않았습니다';
    } else if (error.name === 'NotSupportedError') {
        errorMsg = '이 브라우저는 카메라/마이크를 지원하지 않습니다';
    } else if (error.name === 'SecurityError') {
        errorMsg = `⚠️ 보안 정책으로 인해 카메라/마이크 접근이 거부되었습니다.\n(HTTPS 또는 localhost에서 접속해주세요)\n현재: ${window.location.protocol}//${window.location.host}`;
    }
    
    console.error(`📌 해결책:\n${errorMsg}`);
    return errorMsg;
}

// 전역 변수
const state = {
    socket: null,
    roomId: null,
    userName: null,
    localStream: null,
    screenStream: null,
    peerConnections: {},
    dataChannels: {},
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false,
    remoteUsers: {},
    currentScreenShareUserId: null,
    isSidebarVisible: true,
    isControlBarVisible: true,
    isInstructor: false,
    suggestedQuestion: null,
    userColors: {}, // ✅ 사용자별 색깔 저장
    userNames: {},   // ✅ 사용자 ID → 사용자명 매핑 (이름 변경 추적용)
    // ✅ 퀴즈 관련 데이터
    currentQuiz: null,       // {question: string, correctAnswer: 'O' or 'X', timestamp: number}
    quizAnswers: {},         // {quizId: {userId: 'O' or 'X'}} - 퀴즈별 응답 추적
    quizStatuses: {},        // ✅ {quizId: 'ongoing' or 'finished'} - 각 퀴즈별 독립적 상태
    hasAnsweredQuiz: false,  // 현재 퀴즈에 대한 본인의 응답 여부
    correctAnswer: null,     // 현재 퀴즈의 정답 (강의자가 설정)
    quizHistory: []          // ✅ 출제된 퀴즈 기록 배열
};

// ✅ HTML 이스케이핑 함수 (XSS 방지)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ✅ 사용자별 색깔 생성 함수 (userId 기반)
function getUserColor(userId) {
    if (state.userColors[userId]) {
        return state.userColors[userId];
    }
    
    // 색깔 팔레트 (다양한 색상)
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C7CEEA'
    ];
    
    // userId 기반 해시로 색깔 선택 (같은 사용자는 항상 같은 색깔)
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colorIndex = Math.abs(hash) % colors.length;
    const color = colors[colorIndex];
    state.userColors[userId] = color;
    
    return color;
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeLoginScreen();
    initializeConferenceScreen();
    // ✅ 수정: setupSocketEvents()는 initializeConferenceScreen 안에서만 호출됨 (중복 방지)
});

// ========== 로그인 화면 ==========
function initializeLoginScreen() {
    const generateRoomBtn = document.getElementById('generate-room-btn');
    const loginForm = document.getElementById('login-form');
    const joinRoomBtn = document.getElementById('join-room-btn');

    generateRoomBtn.addEventListener('click', generateNewRoom);
    loginForm.addEventListener('submit', handleLogin);
    joinRoomBtn.addEventListener('click', handleJoinExistingRoom);

    generateNewRoom();
}

function generateNewRoom() {
    const roomId = 'ROOM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    document.getElementById('room-id').value = roomId;
}

function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('username');
    const userName = usernameInput.value.trim();
    const roomId = document.getElementById('room-id').value.trim();

    if (!userName) {
        usernameInput.setCustomValidity('이름을 입력해주세요');
        usernameInput.reportValidity();
        return;
    }

    usernameInput.setCustomValidity('');
    joinRoom(userName, roomId);
}

function handleJoinExistingRoom() {
    const usernameInput = document.getElementById('username');
    const userName = usernameInput.value.trim();
    const roomId = document.getElementById('join-room-id').value.trim();

    if (!userName) {
        usernameInput.setCustomValidity('이름을 입력해주세요');
        usernameInput.reportValidity();
        return;
    }

    usernameInput.setCustomValidity('');

    if (!roomId) {
        alert('⚠️ 회의 ID를 입력해주세요!');
        document.getElementById('join-room-id').focus();
        return;
    }

    // ✅ 참여 버튼이므로 isJoining: true로 전달
    joinRoom(userName, roomId, true);
}

// ========== 회의 참여 ==========
async function joinRoom(userName, roomId, isJoining = false) {
    state.userName = userName;
    state.roomId = roomId;

    try {
        // ✅ 보안 컨텍스트 확인 (다른 네트워크 진단)
        const isSecure = isSecureContext();
        console.log(`🔒 보안 상태: ${isSecure ? '✅ 안전함 (HTTPS/localhost)' : '⚠️ 제한됨 (HTTP 로컬 IP)'}`);
        console.log(`📍 접속 주소: ${window.location.protocol}//${window.location.host}`);
        console.log(`🌐 백엔드: ${BACKEND_URL}`);
        
        if (!isSecure) {
            console.warn('⚠️ 비보안 컨텍스트에서 실행 중 (로컬 IP 접속)\n' +
                        'WebRTC: HTTPS 또는 localhost에서만 작동\n' +
                        '채팅, 퀴즈는 정상 작동합니다');
            showNotification('💡 카메라/화면공유는 HTTPS 또는 localhost에서만 작동합니다', 'info');
        }

        // ✅ STEP 1: 먼저 서버에 방 입장 요청 (캠 켜기 전!)
        showNotification('서버 연결 중...', 'info');
        
        if (!state.socket) {
            // ✅ 강화된 재연결 설정 (간헐적 끊김 대비)
            state.socket = io(BACKEND_URL, {
                reconnection: true,
                reconnectionDelay: 500,       // 더 빠른 초기 재시도
                reconnectionDelayMax: 10000,  // 더 오래 재시도
                reconnectionAttempts: Infinity, // ✅ 무제한 재시도
                transports: ['websocket', 'polling'],
                upgrade: true,
                rejectUnauthorized: false,
                multiplex: false
            });

            // ✅ 연결 이벤트 모니터링 (다른 네트워크 환경 진단용)
            state.socket.on('connect', () => {
                console.log(`✅ 서버 연결 성공`);
            });

            state.socket.on('connect_error', (error) => {
                console.error(`❌ 서버 연결 오류:`, error.message);
            });

            state.socket.on('disconnect', (reason) => {
                console.warn(`⚠️  서버 연결 종료: ${reason}`);
                if (reason === 'transport close') {
                    console.log('⏳ 자동으로 재연결을 시도 중입니다');
                }
            });
        }

        // ✅ 방 입장 검증 (타임아웃 5초)
        const joinPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('방 입장 요청 타임아웃 (5초)'));
            }, 5000);

            // ✅ 서버에서 'room-validation' 응답 대기
            state.socket.once('room-validation', (response) => {
                clearTimeout(timeout);
                if (response && response.error) {
                    reject(new Error(response.message));
                } else {
                    resolve(response);
                }
            });

            // ✅ 방 입장 요청 (room-validation 응답 기다림)
            state.socket.emit('validate-room', {
                roomId: roomId,
                userName: userName,
                isJoining: isJoining
            });
        });

        // 방 입장 검증 완료 (서버에서 OK 받았음) 
        await joinPromise;
        console.log('✅ 방 입장 검증 완료');

        // ✅ STEP 2: 검증 성공 후에만 카메라 켜기
        showNotification('카메라 접근 중...', 'info');
        
        const mediaPromise = navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });

        const mediaWithTimeout = Promise.race([
            mediaPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('카메라 접근 타임아웃 (10초)')), 10000)
            )
        ]);

        const stream = await mediaWithTimeout.catch(error => {
            // ✅ 권한 오류 처리
            const errorMsg = handleMediaError(error, 'joinRoom-getUserMedia');
            throw new Error(errorMsg);
        });

        state.localStream = stream;
        console.log(`✅ 로컬 스트림 획득: ${stream.getTracks().length}개 트랙`);

        // 로컬 비디오 표시
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = stream;

        // 화면 전환
        document.getElementById('login-container').classList.remove('active');
        document.getElementById('conference-container').classList.add('active');

        // ✅ 강의실 코드 표시
        document.getElementById('room-info').style.display = 'block';
        document.getElementById('current-room-id').textContent = roomId;

        // 로컬 이름 표시
        document.getElementById('local-username').textContent = userName;

        // ✅ 네트워크 상태 표시
        console.log(`📌 WebRTC 기능: ${isSecure ? '✅ 모두 사용 가능' : '❌ 카메라/화면공유만 제한'}`);

        // ✅ STEP 3: 이제 join-room 완료 (existing-users 대기)
        const existingUsersPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('사용자 목록 수신 타임아웃 (5초)'));
            }, 5000);

            state.socket.once('existing-users', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });

            // 검증 후 실제 방 입장
            state.socket.emit('join-room', {
                roomId: roomId,
                userName: userName,
                isJoining: isJoining
            });
        });

        await existingUsersPromise;
        console.log('✅ 방 입장 완료');
        showNotification(`${userName}님이 회의에 입장했습니다`, 'success');

    } catch (error) {
        const errorMsg = error.message || '카메라/마이크 접근 권한을 확인해주세요';
        showNotification(errorMsg, 'error');
        console.error('❌ 회의 입장 오류:', error);

        // ✅ 로컬 스트림 정리 (캠 끄기)
        if (state.localStream) {
            try {
                state.localStream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.error('로컬 스트림 정리 중 오류:', e);
            }
            state.localStream = null;
        }

        // 오류 시 로그인 화면으로 복귀
        document.getElementById('conference-container').classList.remove('active');
        document.getElementById('login-container').classList.add('active');
    }
}

// ========== 소켓 이벤트 ==========
function setupSocketEvents() {
    console.log('🔵 setupSocketEvents() 함수 시작됨');
    
    // 다른 사용자가 입장했을 때
    document.addEventListener('socket-user-joined', (e) => {
        const { userId, userName, isInstructor, isVideoEnabled = true, isAudioEnabled = true, totalUsers } = e.detail;
        console.log(`✅ ${userName}이 입장했습니다`);
        showNotification(`${userName}이 입장했습니다`);
        
        // Backend에서 보낸 totalUsers 직접 사용
        if (totalUsers !== undefined) {
            document.getElementById('participant-count').textContent = totalUsers;
        } else {
            updateParticipantCount();
        }
        
        addParticipantToList(userId, userName, isInstructor, isVideoEnabled, isAudioEnabled);

        // ✅ 새로운 사용자의 정보를 state.remoteUsers에 저장 (강의자 정보 포함)
        if (!state.remoteUsers[userId]) {
            state.remoteUsers[userId] = {};
        }
        state.remoteUsers[userId].isVideoEnabled = isVideoEnabled;
        state.remoteUsers[userId].isAudioEnabled = isAudioEnabled;
        state.remoteUsers[userId].isInstructor = isInstructor;  // ✅ 강의자 정보 저장
        state.remoteUsers[userId].name = userName;  // ✅ 사용자 이름 저장

        // ✅ 수정: 여기서는 offer를 보내지 않음
        // 새로 들어온 사람(userId)이 기존 사용자들(우리)에게 offer를 보낼 것을 기다림
        // 기존 사용자가 새로 들어온 사람에게 offer를 보내면 안 됨 (시그널 충돌 방지)
    });

    // 기존 사용자 목록 받음
    document.addEventListener('socket-existing-users', (e) => {
        const { users, isUserInstructor, totalUsers } = e.detail;
        console.log('기존 사용자:', users);
        
        // 현재 사용자가 강의자인지 설정
        state.isInstructor = isUserInstructor;
        
        // 강의자 배지 표시
        if (state.isInstructor) {
            document.getElementById('instructor-badge-container').style.display = 'flex';
            // 로컬 비디오를 크게 표시
            document.getElementById('local-video-container').classList.add('instructor');
            // ✅ 추가: 강의자인 경우 익명화 버튼도 표시
            const anonymizeBtn = document.getElementById('anonymize-btn');
            if (anonymizeBtn) {
                anonymizeBtn.style.display = 'block';
            }
            // ✅ 추가: 강의자인 경우 퀴즈 탭 버튼 표시
            const quizTabBtn = document.getElementById('quiz-tab-btn');
            if (quizTabBtn) {
                quizTabBtn.style.display = 'block';
            }
        }
        
        // ✅ 수정: Backend에서 보낸 totalUsers 직접 사용 (또는 계산)
        let total = totalUsers;
        if (total === undefined) {
            // totalUsers가 없으면 직접 계산: 자신 + 기존 사용자
            total = 1 + users.length;
        }
        document.getElementById('participant-count').textContent = total;
        
        // 자신을 참여자 목록에 먼저 추가
        addParticipantToList(state.socket.id, state.userName, state.isInstructor, state.isVideoEnabled, state.isAudioEnabled);
        
        // 기존 사용자 추가 및 Offer 생성
        users.forEach(user => {
            // ✅ 사용자의 미디어 상태 전달 (기본값: 켜짐)
            const isVideoEnabled = user.isVideoEnabled !== undefined ? user.isVideoEnabled : true;
            const isAudioEnabled = user.isAudioEnabled !== undefined ? user.isAudioEnabled : true;
            
            addParticipantToList(user.id, user.name, user.isInstructor, isVideoEnabled, isAudioEnabled);
            
            // ✅ 원격 사용자 정보에 미디어 상태 및 강의자 정보 저장 (handleRemoteStream 전에)
            if (!state.remoteUsers[user.id]) {
                state.remoteUsers[user.id] = {};
            }
            state.remoteUsers[user.id].isVideoEnabled = isVideoEnabled;
            state.remoteUsers[user.id].isAudioEnabled = isAudioEnabled;
            state.remoteUsers[user.id].isInstructor = user.isInstructor;  // ✅ 강의자 정보 저장
            state.remoteUsers[user.id].name = user.name;  // ✅ 사용자 이름 저장
            
            // ✅ 수정: 새로 들어온 내가 기존 사용자들(user)에게 offer를 보냄
            // 이렇게 해야 시그널 충돌이 없음
            createOffer(user.id, user.name, user.isInstructor);
        });
    });

    // 오퍼 받음
    document.addEventListener('socket-offer', (e) => {
        const { from, fromName, fromIsInstructor, offer } = e.detail;
        console.log(`📤 Offer 받음: ${fromName}으로부터`);
        handleOffer(from, fromName, fromIsInstructor || false, offer);
    });

    // 답변 받음
    document.addEventListener('socket-answer', (e) => {
        const { from, answer } = e.detail;
        console.log(`📥 Answer 받음: ${from}으로부터`);
        handleAnswer(from, answer);
    });

    // ICE 후보 받음
    document.addEventListener('socket-ice-candidate', (e) => {
        const { from, candidate } = e.detail;
        handleIceCandidate(from, candidate);
    });

    // 사용자가 떠남
    document.addEventListener('socket-user-left', (e) => {
        const { userId, userName, totalUsers, reason } = e.detail;
        
        console.log(`👋 ${userName}이 퇴장했습니다 (사유: ${reason})`);
        
        // ✅ 다른 네트워크 환경에서의 퇴장 사유 표시
        let userMessage = `${userName}이 퇴장했습니다`;
        
        if (reason === 'transport close' || reason === 'ping timeout') {
            userMessage = `${userName}의 연결이 끊어졌습니다 (네트워크 오류)`;
        } else if (reason === 'client namespace disconnect') {
            userMessage = `${userName}이 명시적으로 연결을 끊었습니다`;
        } else if (reason === 'server namespace disconnect') {
            userMessage = `서버에서 ${userName}의 연결을 종료했습니다`;
        }
        
        showNotification(userMessage);
        removeRemoteUser(userId);
        
        // ✅ 수정: Backend에서 보낸 totalUsers 직접 사용
        if (totalUsers !== undefined) {
            document.getElementById('participant-count').textContent = totalUsers;
        } else {
            updateParticipantCount();
        }
        
        // 참여자 목록에서 사용자 제거
        const participantEl = document.getElementById(`participant-${userId}`);
        if (participantEl) {
            participantEl.remove();
        }
    });

    // 사용자 이름 변경 이벤트
    document.addEventListener('socket-user-renamed', (e) => {
        const { userId, oldName, newName } = e.detail;
        console.log(`✏️ ${oldName}이 ${newName}으로 이름 변경`);
        
        // 1️⃣ state 객체 업데이트
        state.userNames[userId] = newName;
        if (state.remoteUsers[userId]) {
            state.remoteUsers[userId].name = newName;
        }
        
        // 2️⃣ 참여자 목록에서 해당 사용자의 이름 업데이트
        const participantEl = document.getElementById(`participant-${userId}`);
        if (participantEl) {
            const nameContainer = participantEl.querySelector('.participant-name-container');
            if (nameContainer) {
                // 기존 배지 보존
                const badge = nameContainer.querySelector('.instructor-badge');
                nameContainer.textContent = newName;
                if (badge) {
                    nameContainer.appendChild(badge.cloneNode(true));
                }
            }
        }
        
        // 3️⃣ 비디오 라벨 업데이트
        const videoContainer = document.getElementById(`remote-video-${userId}`);
        if (videoContainer) {
            const label = videoContainer.querySelector('.video-label');
            if (label) {
                label.textContent = newName;
                console.log(`✏️ 비디오 라벨 업데이트: ${userId} → ${newName}`);
            }
        }
    });

    // 화면 공유 시작
    document.addEventListener('socket-screen-share-start', (e) => {
        const { userId, userName } = e.detail;
        showNotification(`${userName}님이 화면을 공유하고 있습니다`);
        state.currentScreenShareUserId = userId;
        
        // ✅ 자신이 아닌 다른 사람이 화면공유 시작했으면 버튼 비활성화
        const screenShareBtn = document.getElementById('screen-share-btn');
        if (userId !== state.socket.id && screenShareBtn) {
            screenShareBtn.disabled = true;
            screenShareBtn.style.opacity = '0.5';
            screenShareBtn.title = '다른 사용자가 화면을 공유 중입니다';
        }
        
        handleScreenShareStart(userId, userName);
    });

    // 화면 공유 종료
    document.addEventListener('socket-screen-share-stop', (e) => {
        const { userId } = e.detail;
        state.currentScreenShareUserId = null;
        
        // ✅ 버튼 활성화
        const screenShareBtn = document.getElementById('screen-share-btn');
        if (screenShareBtn) {
            screenShareBtn.disabled = false;
            screenShareBtn.style.opacity = '1';
            screenShareBtn.title = '화면 공유';
        }
        
        handleScreenShareEnd(userId);
    });

    // 채팅 메시지 받음
    document.addEventListener('socket-chat-message', (e) => {
        const { userId, userName, message, timestamp, isInstructor, imageData } = e.detail;
        // ✅ userId 전달해서 사용자별 색깔 관리
        addChatMessage(userId, userName, message, timestamp, isInstructor, imageData);
    });
}

// Socket.IO 이벤트 연결
function initializeSocket() {
    if (!state.socket) {
        // ✅ 강화된 재연결 설정 (주기적 끊김 대비)
        state.socket = io(BACKEND_URL, {
            reconnection: true,           // 자동 재연결 활성화
            reconnectionDelay: 500,       // 첫 재시도까지 0.5초 대기 (더 빠르게)
            reconnectionDelayMax: 10000,  // 최대 10초 대기 (더 오래 재시도)
            reconnectionAttempts: Infinity, // ✅ 무제한 재시도 (계속 재시도)
            transports: ['websocket', 'polling'],  // WebSocket 우선, 폴백 폴링
            upgrade: true,                // 연결 우그레이드 시도
            multiplex: false,             // ✅ 다중 탭/창 환경에서 안정성
            rejectUnauthorized: false,    // HTTPS 자체서명 인증서도 허용 (개발 환경)
            query: {
                version: '1.0',           // API 버전 정보 전달
                platform: navigator.platform
            }
        });
        
        console.log(`📡 Socket.IO 초기화 (Backend: ${BACKEND_URL})`);
    }

    // 연결 성공
    state.socket.on('connect', () => {
        console.log('✅ 서버에 연결됨 (Socket ID:', state.socket.id, ')');
        showNotification('✅ 서버 연결 성공', 'success');
        
        // ⚠️ 보험용: 여기서도 quiz-results-data 리스너 등록
        state.socket.on('quiz-results-data', (data) => {
            console.log('🎯🎯🎯 [connect 핸들러] quiz-results-data 이벤트 받음!', data);
            displayQuizResults(data, data.quizId, data.correctAnswer);
        });
    });
    
    // 📌 다른 네트워크 환경에서 연결 끊김 감지
    state.socket.on('disconnect', (reason) => {
        console.warn(`⚠️ 서버 연결 끊김: ${reason}`);
        if (reason === 'io server disconnect') {
            showNotification('⏳ 서버와의 연결 복구 중...', 'warning');
        } else if (reason === 'transport close') {
            showNotification('⏳ 네트워크 복구 중...', 'warning');
        } else {
            showNotification(`⏳ 연결 복구 중... (${reason})`, 'warning');
        }
    });
    
    // 📌 재연결 시도 중
    state.socket.on('connect_error', (error) => {
        console.error('❌ Socket 연결 오류:', error);
    });
    
    // 📌 재연결 성공
    state.socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ 재연결 성공 (${attemptNumber}번째 시도)`);
        showNotification('✅ 연결 복구됨', 'success');
    });

    // 다른 사용자 입장
    state.socket.on('user-joined', (data) => {
        const event = new CustomEvent('socket-user-joined', { detail: data });
        document.dispatchEvent(event);
    });

    // 기존 사용자 목록
    state.socket.on('existing-users', (data) => {
        const event = new CustomEvent('socket-existing-users', { detail: data });
        document.dispatchEvent(event);
    });

    // Offer 받음
    state.socket.on('offer', (data) => {
        const event = new CustomEvent('socket-offer', { detail: data });
        document.dispatchEvent(event);
    });

    // Answer 받음
    state.socket.on('answer', (data) => {
        const event = new CustomEvent('socket-answer', { detail: data });
        document.dispatchEvent(event);
    });

    // ICE 후보
    state.socket.on('ice-candidate', (data) => {
        const event = new CustomEvent('socket-ice-candidate', { detail: data });
        document.dispatchEvent(event);
    });

    // 사용자 퇴장
    state.socket.on('user-left', (data) => {
        const event = new CustomEvent('socket-user-left', { detail: data });
        document.dispatchEvent(event);
    });

    // ✅ 강의자가 나갔을 때 - 방 폐쇄
    state.socket.on('room-closed', (data) => {
        console.log('🔴 [방 폐쇄] 강의자가 나갔습니다');
        const { message, reason } = data;
        
        showNotification(message || '강의자가 나갔습니다. 방이 폐쇄됩니다.', 'error');
        
        // ✅ 강제 퇴장 (confirm 없이 즉시 실행)
        console.log('🛑 강제 퇴장 진행 중...');
        forceLeaveConference(reason || '강의자가 나갔습니다');
    });

    // 사용자 이름 변경
    state.socket.on('user-renamed', (data) => {
        const { userId, oldName, newName } = data;
        const event = new CustomEvent('socket-user-renamed', { detail: { userId, oldName, newName } });
        document.dispatchEvent(event);
    });

    // ✅ 사용자 미디어 상태 변경 (마이크/카메라)
    state.socket.on('user-media-state-changed', (data) => {
        const { userId, userName, isVideoEnabled, isAudioEnabled } = data;
        updateParticipantMediaState(userId, userName, isVideoEnabled, isAudioEnabled);
        // ✅ 원격 비디오 위의 아이콘도 업데이트
        updateRemoteVideoMediaStateNew(userId, isVideoEnabled, isAudioEnabled);
    });

    // 화면 공유 시작
    state.socket.on('user-started-screen-share', (data) => {
        const { userId, userName } = data;
        const event = new CustomEvent('socket-screen-share-start', { detail: { userId, userName } });
        document.dispatchEvent(event);
    });

    // 화면 공유 종료
    state.socket.on('user-stopped-screen-share', (data) => {
        const event = new CustomEvent('socket-screen-share-stop', { detail: data });
        document.dispatchEvent(event);
    });

    // 채팅 메시지
    state.socket.on('receive-message', (data) => {
        const { userId, userName, message, timestamp, isInstructor, imageData } = data;
        // ✅ userId 추가해서 전달
        const event = new CustomEvent('socket-chat-message', { detail: { userId, userName, message, timestamp, isInstructor, imageData } });
        document.dispatchEvent(event);
    });

    // ✅ 익명 모드 활성화 이벤트
    state.socket.on('anonymous-mode-activated', (data) => {
        const { users } = data;
        console.log(`🎭 익명 모드 활성화! 참여자 수: ${users.length}`);
        console.log(`📝 받은 데이터:`, users);
        
        // ✅ 수정: 참여자 목록 전체 갱신 (더 견고한 방식)
        const participantsList = document.getElementById('participants-list');
        
        // 모든 참여자를 다시 그리기
        users.forEach(user => {
            // 1️⃣ 좌측 참여자 목록 업데이트
            let participantEl = document.getElementById(`participant-${user.id}`);
            
            if (participantEl) {
                // 기존 요소 업데이트
                const nameContainer = participantEl.querySelector('.participant-name-container');
                if (nameContainer) {
                    // 강의자 배지 추출
                    const badge = nameContainer.querySelector('.instructor-badge');
                    
                    // 텍스트만 변경
                    nameContainer.innerHTML = '';
                    nameContainer.textContent = user.name;
                    
                    // 배지 재추가
                    if (badge && !user.isInstructor) {
                        // 학생인 경우: 배지 추가 안 함 (강의자 제외)
                        console.log(`[익명화] ${user.name}: 배지 제거됨 (학생)`);
                    } else if (user.isInstructor && badge) {
                        // 강의자인 경우: 배지 유지
                        nameContainer.appendChild(badge.cloneNode(true));
                        console.log(`[익명화] ${user.name}: 배지 유지됨 (강의자)`);
                    }
                    
                    console.log(`[익명화 완료] ${user.name} (강의자: ${user.isInstructor})`);
                }
            }
            
            // 2️⃣ state.remoteUsers에서 이름 업데이트
            if (state.remoteUsers[user.id]) {
                state.remoteUsers[user.id].name = user.name;
                console.log(`[익명화] state.remoteUsers 업데이트: ${user.id} → ${user.name}`);
            }
            
            // 3️⃣ 화면의 비디오 위 이름 표시 업데이트
            // ✅ 로컬 사용자인 경우
            if (user.id === state.socket.id) {
                // ✅ state.userName 업데이트 (채팅 전송 시 사용될 이름)
                state.userName = user.name;
                
                const localUsernameEl = document.getElementById('local-username');
                if (localUsernameEl) {
                    localUsernameEl.textContent = user.name;
                    console.log(`[익명화] 로컬 비디오 라벨 업데이트: ${user.id} → ${user.name}`);
                }
                console.log(`[익명화] state.userName 업데이트: ${user.name}`);
            } else {
                // ✅ 원격 사용자인 경우
                const videoContainer = document.getElementById(`remote-video-${user.id}`);
                if (videoContainer) {
                    const label = videoContainer.querySelector('.video-label');
                    if (label) {
                        // ✅ 강의자 배지 유지
                        if (user.isInstructor) {
                            label.innerHTML = `${user.name} <span class="instructor-badge">강의자</span>`;
                            console.log(`[익명화] 비디오 label 업데이트 (강의자 배지 유지): ${user.id} → ${user.name}`);
                        } else {
                            label.textContent = user.name;
                            console.log(`[익명화] 비디오 label 업데이트: ${user.id} → ${user.name}`);
                        }
                    }
                }
            }
        });

        showNotification('🎭 익명 모드가 활성화되었습니다');
    });

    // ========== 퀴즈 이벤트 리스너 ==========
    // 퀴즈 출제됨
    state.socket.on('quiz-created', (data) => {
        const { quizId, question, correctAnswer, instructorName, timestamp, quizNumber } = data;
        console.log(`❓ 퀴즈 출제됨: 퀴즈 ${quizNumber} - ${question} (정답: ${correctAnswer}) [ID: ${quizId}]`);
        
        state.currentQuiz = {
            quizId: quizId,  // ✅ quizId 포함
            question: question,
            correctAnswer: correctAnswer,
            timestamp: timestamp || Date.now(),
            quizNumber: quizNumber  // ✅ 퀴즈 번호 추가
        };
        
        // ✅ 각 퀴즈별 독립적으로 상태 관리
        state.quizStatuses[quizId] = 'ongoing';
        state.quizAnswers[quizId] = {};  // ✅ 이 퀴즈만 새로 생성 (다른 답변은 유지)
        
        state.correctAnswer = correctAnswer;
        state.hasAnsweredQuiz = false;

        displayQuiz(question, quizNumber);
    });

    // 퀴즈 결과
    console.log('📋 quiz-results-data 리스너 등록 중...');
    state.socket.on('quiz-results-data', (data) => {
        console.log('🎯🎯🎯 quiz-results-data 이벤트 도착!!!', data);
        const { quizId, question, correctAnswer, oCount, xCount, totalAnswers, answers } = data;
        console.log(`📊 퀴즈 결과: O=${oCount}, X=${xCount}, quizId=${quizId}, 정답=${correctAnswer}`);
        
        // ✅ 각 퀴즈별 독립적으로 상태 변경
        state.quizStatuses[quizId] = 'finished';
        console.log(`🔒 퀴즈 ${quizId} 상태 변경: finished (답변 불가능)`);
        
        const results = {
            quizId: quizId,
            question: question,
            correctAnswer: correctAnswer,
            oCount: oCount,
            xCount: xCount,
            totalAnswers: totalAnswers
        };

        displayQuizResults(results, quizId, correctAnswer);
    });
    console.log('📋 quiz-results-data 리스너 등록 완료');

    // ✅ 수정: 퀴즈 응답 업데이트 (실시간 반영)
    state.socket.on('quiz-answer-updated', (data) => {
        const { userId, userName, answer, oCount, xCount, totalAnswers, quizId } = data;
        console.log(`📤 퀴즈 응답 업데이트 수신: ${userName} - ${answer} (O=${oCount}, X=${xCount}, quizId=${quizId})`);
        console.log(`🔍 현재 state.quizHistory 길이: ${state.quizHistory.length}, 내용:`, state.quizHistory.map(q => ({quizId: q.quizId, question: q.question.substring(0, 20)})));
        
        // state 업데이트 (퀴즈별 사용자 응답 저장)
        if (!state.quizAnswers[quizId]) {
            state.quizAnswers[quizId] = {};
        }
        state.quizAnswers[quizId][userId] = answer;
        
        // 출제 기록 업데이트
        if (quizId) {
            const quizEntry = state.quizHistory.find(q => q.quizId === quizId);
            console.log(`🔍 quizId=${quizId}에 해당하는 quizEntry 찾음:`, quizEntry ? '✅ 찰금' : '❌ 없음');
            
            if (quizEntry) {
                quizEntry.oCount = oCount;
                quizEntry.xCount = xCount;
                console.log(`✅ state 업데이트: oCount=${oCount}, xCount=${xCount}`);
                
                // ✅ 수정: 더 명확한 선택자 사용 (quiz-history-item 아이템의 result-badge만 선택)
                const resultBadge = document.querySelector(`.quiz-history-item[data-quiz-id="${quizId}"] .result-badge`);
                if (resultBadge) {
                    resultBadge.textContent = totalAnswers;
                    console.log(`✅ 출제 기록 배지 업데이트: ${totalAnswers}`);
                } else {
                    console.warn(`⚠️ selector '.quiz-history-item[data-quiz-id="${quizId}"] .result-badge'로 요소를 찾을 수 없습니다`);
                    console.log(`🔍 현재 모든 quiz-history-item 요소:`, Array.from(document.querySelectorAll('.quiz-history-item')).map(el => ({dataQuizId: el.getAttribute('data-quiz-id'), text: el.innerText.substring(0, 30)})));
                }
            }
        }
        
        // ✅ 수정: 채팅 버튼의 카운트 업데이트 (chat-quiz-buttons만 선택)
        const chatQuizContainer = document.querySelector(`.chat-quiz-buttons[data-quiz-id="${quizId}"]`);
        
        if (chatQuizContainer) {
            const countOElement = chatQuizContainer.querySelector('.quiz-count-o');
            const countXElement = chatQuizContainer.querySelector('.quiz-count-x');
            
            if (countOElement) {
                countOElement.textContent = oCount;
            }
            if (countXElement) {
                countXElement.textContent = xCount;
            }
            
            console.log(`✅ 채팅 버튼 카운트 업데이트 완료 (quizId: ${quizId}): O=${oCount}, X=${xCount}`);
        } else {
            console.warn(`⚠️ selector '.chat-quiz-buttons[data-quiz-id="${quizId}"]'로 요소를 찾을 수 없습니다`);
            console.log(`🔍 현재 모든 chat-quiz-buttons 요소:`, Array.from(document.querySelectorAll('.chat-quiz-buttons')).map(el => ({dataQuizId: el.getAttribute('data-quiz-id'), html: el.innerHTML.substring(0, 50)})));
        }
    });
    
    console.log('✅ setupSocketEvents() 함수 모든 리스너 등록 완료!');
}

// ========== 회의 화면 ==========
function initializeConferenceScreen() {
    // 소켓 초기화 및 이벤트 세팅
    initializeSocket();
    setupSocketEvents();

    // 비디오 토글
    document.getElementById('toggle-video-btn').addEventListener('click', toggleVideo);
    document.getElementById('toggle-audio-btn').addEventListener('click', toggleAudio);

    // 화면 공유
    document.getElementById('screen-share-btn').addEventListener('click', toggleScreenShare);

    // 사이드바 토글
    document.getElementById('toggle-sidebar-btn').addEventListener('click', toggleSidebar);

    // 제어 바 토글 버튼
    const controlBarToggleBtn = document.getElementById('control-bar-toggle-btn');
    if (controlBarToggleBtn) {
        controlBarToggleBtn.addEventListener('click', toggleControlBar);
    }

    // ✅ 강의실 코드 복사
    document.getElementById('copy-room-code-btn').addEventListener('click', copyRoomCode);

    // 이름 변경 메뉴
    document.getElementById('username-menu-btn').addEventListener('click', toggleUsernameMenu);
    document.getElementById('rename-username-btn').addEventListener('click', renameUsername);

    // 질문 다듬기
    document.getElementById('refine-question-btn').addEventListener('click', refineQuestion);
    document.getElementById('accept-suggestion-btn').addEventListener('click', acceptSuggestion);
    document.getElementById('reject-suggestion-btn').addEventListener('click', rejectSuggestion);

    // 회의 종료
    document.getElementById('leave-btn').addEventListener('click', leaveConference);

    // ✅ 익명화 버튼 (강의자만 활성화)
    const anonymizeBtn = document.getElementById('anonymize-btn');
    if (anonymizeBtn) {
        // 나중에 joinRoom 후 state.isInstructor 값을 받으면 보이게 함
        anonymizeBtn.addEventListener('click', activateAnonymousMode);
    }

    // 채팅 전송
    document.getElementById('send-message-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // 파일 첨부
    const attachBtn = document.getElementById('attach-file-btn');
    const fileInput = document.getElementById('file-input');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    if (attachBtn) attachBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (removeImageBtn) removeImageBtn.addEventListener('click', clearImagePreview);

    // 이미지 모달
    const imageModal = document.getElementById('image-modal');
    const closeModalBtn = document.getElementById('close-image-modal-btn');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeImageModal);
    }
    
    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) {
                closeImageModal();
            }
        });
    }

    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // ========== 퀴즈 이벤트 리스너 ==========
    // 강의자의 퀴즈 출제 버튼
    const submitQuizBtn = document.getElementById('submit-quiz-btn');
    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', createQuiz);
    }

    // 채팅 내 퀴즈 버튼들 (동적 생성되므로 이벤트 위임 사용)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('quiz-answer-choice')) {
            const answer = e.target.dataset.answer;
            if (answer) {
                submitAnswerFromChat(answer);
            }
        }
    });

    const closeQuizBtn = document.getElementById('close-quiz-btn');
    if (closeQuizBtn) {
        closeQuizBtn.addEventListener('click', closeQuiz);
    }

    // 강의자용 결과보기 버튼
    const showResultsBtn = document.getElementById('show-quiz-results-btn');
    if (showResultsBtn) {
        showResultsBtn.addEventListener('click', showQuizResults);
    }

    // 화면 공유 닫기
    document.getElementById('close-screen-share-btn').addEventListener('click', closeScreenShare);

    // 메뉴 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('username-menu');
        const menuBtn = document.getElementById('username-menu-btn');
        if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

// ========== WebRTC 연결 ==========
// Offer 생성 담당자 결정 (상대방과의 통신 중복 방지)
function shouldInitiateOffer(remoteUserId) {
    // 내 ID가 상대방 ID보다 작으면 내가 Offer 보냄
    // 일관성 있는 결정으로 양쪽 모두 Offer 보내는 것 방지
    return state.socket.id < remoteUserId;
}

async function createOffer(remoteUserId, remoteUserName, remoteUserIsInstructor = false) {
    try {
        console.log(`📋 Offer 생성 시작: ${remoteUserName}에게 (강의자: ${remoteUserIsInstructor})`);
        const peerConnection = createPeerConnection(remoteUserId, remoteUserName, remoteUserIsInstructor);

        // 로컬 스트림 추가 (트랙이 있는 경우만)
        if (state.localStream && state.localStream.getTracks().length > 0) {
            console.log(`[Offer] 로컬 스트림 추가 시작, track 수: ${state.localStream.getTracks().length}`);
            state.localStream.getTracks().forEach((track, idx) => {
                console.log(`[Offer] Track ${idx}: ${track.kind} - enabled: ${track.enabled}`);
                peerConnection.addTrack(track, state.localStream);
            });
        } else {
            console.warn(`[Offer] 로컬 스트림이 없거나 트랙이 없습니다`);
        }

        // ✅ Offer 생성 (타임아웃 10초)
        const offerPromise = peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        const offerWithTimeout = Promise.race([
            offerPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Offer 생성 타임아웃')), 10000)
            )
        ]);

        const offer = await offerWithTimeout;
        await peerConnection.setLocalDescription(offer);
        console.log(`✅ Local Description 설정 완료`);

        // Offer 전송
        state.socket.emit('offer', {
            to: remoteUserId,
            from: state.socket.id,
            fromName: state.userName,
            fromIsInstructor: state.isInstructor,
            offer: offer
        });

        console.log(`📤 Offer 전송 완료: ${remoteUserName}에게`);
    } catch (error) {
        console.error(`❌ Offer 생성 오류 (${remoteUserName}):`, error.message);
        
        // 구체적인 오류 메시지
        if (error.message.includes('타임아웃')) {
            console.error(`   원인: 네트워크 지연 또는 ICE 수집 실패`);
        } else if (error.message.includes('InvalidStateError')) {
            console.error(`   원인: Peer Connection 상태 오류`);
        }
        
        // Peer Connection 정리
        if (state.peerConnections[remoteUserId]) {
            state.peerConnections[remoteUserId].close();
            delete state.peerConnections[remoteUserId];
        }
    }
}

async function handleOffer(remoteUserId, remoteUserName, remoteUserIsInstructor, offer) {
    try {
        console.log(`📋 Offer 수신: ${remoteUserName}에게서 (강의자: ${remoteUserIsInstructor})`);
        let peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            peerConnection = createPeerConnection(remoteUserId, remoteUserName, remoteUserIsInstructor);
            
            // 양방향 스트림을 위해 track 추가
            if (state.localStream && state.localStream.getTracks().length > 0) {
                console.log(`[handleOffer] 로컬 스트림 추가 시작, track 수: ${state.localStream.getTracks().length}`);
                state.localStream.getTracks().forEach((track, idx) => {
                    console.log(`[handleOffer] Track ${idx}: ${track.kind} - enabled: ${track.enabled}`);
                    peerConnection.addTrack(track, state.localStream);
                });
            }
        }

        // ✅ Remote Description 설정 (타임아웃 10초)
        const setRemotePromise = peerConnection.setRemoteDescription(
            new RTCSessionDescription(offer)
        );

        await Promise.race([
            setRemotePromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Remote Description 설정 타임아웃')), 10000)
            )
        ]);

        console.log(`✅ Remote Description 설정 완료`);

        // ✅ Answer 생성 (타임아웃 10초)
        const answerPromise = peerConnection.createAnswer();
        const answerWithTimeout = Promise.race([
            answerPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Answer 생성 타임아웃')), 10000)
            )
        ]);

        const answer = await answerWithTimeout;
        await peerConnection.setLocalDescription(answer);
        console.log(`✅ Answer Local Description 설정 완료`);

        // Answer 전송
        state.socket.emit('answer', {
            to: remoteUserId,
            from: state.socket.id,
            answer: answer
        });

        console.log(`📥 Answer 전송 완료: ${remoteUserName}에게`);
    } catch (error) {
        console.error(`❌ Offer 처리 오류 (${remoteUserName}):`, error.message);
        
        if (error.message.includes('타임아웃')) {
            console.error(`   원인: 네트워크 지연 또는 과부하`);
        } else if (error.message.includes('InvalidStateError')) {
            console.error(`   원인: Peer Connection 상태 불일치`);
        }

        // Peer Connection 정리
        if (state.peerConnections[remoteUserId]) {
            state.peerConnections[remoteUserId].close();
            delete state.peerConnections[remoteUserId];
        }
    }
}

async function handleAnswer(remoteUserId, answer) {
    try {
        const peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            console.error('❌ Peer connection이 존재하지 않습니다:', remoteUserId);
            return;
        }

        console.log(`📋 Answer 수신: signaling state = ${peerConnection.signalingState}`);
        
        // signaling state가 "have-local-offer" 상태일 때만 Answer를 설정
        if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn(`⚠️  잘못된 상태에서 Answer 수신. 현재 상태: ${peerConnection.signalingState}`);
            return;
        }

        // ✅ Answer 설정 (타임아웃 10초)
        const setAnswerPromise = peerConnection.setRemoteDescription(answer);
        await Promise.race([
            setAnswerPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Answer 설정 타임아웃')), 10000)
            )
        ]);

        console.log(`✅ Answer 설정 완료: ${remoteUserId}`);
    } catch (error) {
        console.error(`❌ Answer 처리 오류:`, error.message);
        
        if (error.message.includes('타임아웃')) {
            console.error(`   원인: 네트워크 지연`);
        }
    }
}

async function handleIceCandidate(remoteUserId, candidate) {
    try {
        const peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            console.error('❌ Peer connection이 존재하지 않습니다:', remoteUserId);
            return;
        }

        if (candidate) {
            try {
                // ✅ ICE 후보 추가 (타임아웃 5초)
                const addCandidatePromise = peerConnection.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );

                await Promise.race([
                    addCandidatePromise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('ICE 후보 추가 타임아웃')), 5000)
                    )
                ]);

                // 후보 유형 분류 (네트워크 진단용)
                const candidateType = candidate.candidate.split(' ')[7];
                console.log(`✅ ICE 후보 추가됨 (${remoteUserId}): 타입=${candidateType}`);
                
            } catch (error) {
                // IgnoreError는 무시 (PeerConnection이 닫혀 있을 수 있음)
                if (error.name === 'IgnoreError') {
                    console.log(`⏭️  ICE 후보 무시됨 (연결 상태 변화)`);
                } else if (error.message.includes('타임아웃')) {
                    console.warn(`⚠️  ICE 후보 추가 타임아웃 (${remoteUserId})`);
                } else {
                    console.error(`❌ ICE 후보 추가 실패:`, error.name, error.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ handleIceCandidate 오류:', error);
    }
}

function createPeerConnection(remoteUserId, remoteUserName, remoteUserIsInstructor = false) {
    const peerConnection = new RTCPeerConnection({
        iceServers: RTCConfig.iceServers
    });

    state.peerConnections[remoteUserId] = peerConnection;
    
    // ✅ 원격 사용자 정보 초기화 (강의자 정보 포함)
    if (!state.remoteUsers[remoteUserId]) {
        state.remoteUsers[remoteUserId] = {
            name: remoteUserName,
            isInstructor: remoteUserIsInstructor,
            stream: null,
            videoElement: null
        };
    }

    // ✅ ICE 수집 상태 추적 (다른 네트워크 환경 대응)
    let iceCandidateCount = 0;
    let iceGatheringCompleted = false;
    
    // 로컬 ICE 후보 전송
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            iceCandidateCount++;
            console.log(`🧊 ICE 후보 ${iceCandidateCount} 수집됨 (${event.candidate.candidate.substring(0, 50)}...)`);
            
            // ✅ 모든 네트워크 타입 (host, srflx, relay) 전송
            state.socket.emit('ice-candidate', {
                to: remoteUserId,
                from: state.socket.id,
                candidate: event.candidate
            });
        } else if (!event.candidate) {
            iceGatheringCompleted = true;
            console.log(`✅ ICE 수집 완료: 총 ${iceCandidateCount}개 후보`);
        }
    };

    // ✅ ICE 연결 상태 모니터링 (더 상세한 추적)
    peerConnection.oniceconnectionstatechange = () => {
        const state_current = peerConnection.iceConnectionState;
        console.log(`❄️  ICE 연결 상태 (${remoteUserName}): ${state_current}`);
        
        switch (state_current) {
            case 'checking':
                console.log(`⏳ ICE 후보 검사 중 (${remoteUserName})`);
                break;
            case 'connected':
            case 'completed':
                console.log(`✅ ICE 연결 성공 (${remoteUserName})`);
                break;
            case 'failed':
                console.error(`❌ ICE 연결 실패 (${remoteUserName}) - TURN 서버 확인 필요`);
                break;
            case 'disconnected':
                console.warn(`⚠️  ICE 연결 끊김 (${remoteUserName}) - 재연결 시도`);
                break;
        }
    };

    // ✅ Signaling 상태 모니터링
    peerConnection.onsignalingstatechange = () => {
        console.log(`🔄 Signaling 상태 (${remoteUserName}): ${peerConnection.signalingState}`);
    };

    // 원격 스트림 처리
    peerConnection.ontrack = (event) => {
        console.log(`🎬 원격 스트림 수신: ${remoteUserId}, track kind: ${event.track.kind}, streams: ${event.streams.length}`);
        if (event.streams && event.streams.length > 0) {
            handleRemoteStream(remoteUserId, event.streams[0], remoteUserName);
        }
    };

    // ✅ 데이터 채널 상태 모니터링
    peerConnection.ondatachannel = (event) => {
        console.log(`📡 데이터 채널 수신: ${event.channel.label}`);
        setupDataChannel(remoteUserId, event.channel);
    };

    // 연결 상태 변화 (최상위 상태)
    peerConnection.onconnectionstatechange = () => {
        console.log(`🔗 연결 상태 (${remoteUserName}):`, peerConnection.connectionState);

        if (peerConnection.connectionState === 'failed') {
            console.error(`❌ 피어 연결 실패: ${remoteUserName}`);
            removeRemoteUser(remoteUserId);
        } else if (peerConnection.connectionState === 'disconnected') {
            console.warn(`⚠️  피어 연결 끊김: ${remoteUserName} - 재연결 대기 중`);
            // 몇 초 후 자동 복구 시도
            setTimeout(() => {
                if (state.peerConnections[remoteUserId]) {
                    console.log(`🔄 ${remoteUserName} 재연결 시도 중...`);
                }
            }, 3000);
        } else if (peerConnection.connectionState === 'connected') {
            console.log(`✅ 피어 연결 성공: ${remoteUserName}`);
        }
    };

    return peerConnection;
}

function handleRemoteStream(remoteUserId, stream, remoteUserName) {
    console.log(`[handleRemoteStream] 시작, remoteUserId: ${remoteUserId}, 스트림 트랙 수: ${stream.getTracks().length}`);
    
    // ✅ 원격 사용자 정보 업데이트 (스트림 추가)
    if (state.remoteUsers[remoteUserId]) {
        state.remoteUsers[remoteUserId].stream = stream;
    } else {
        // createPeerConnection에서 생성되지 않은 경우 (예상 밖의 상황)
        state.remoteUsers[remoteUserId] = {
            stream: stream,
            name: remoteUserName,
            isInstructor: false,
            videoElement: null
        };
    }

    // 원격 비디오 요소 생성
    if (!document.getElementById(`remote-video-${remoteUserId}`)) {
        // 강의자인지 학생인지 확인해서 적절한 컨테이너 선택
        const userInfo = state.remoteUsers[remoteUserId];
        const isInstructor = userInfo && userInfo.isInstructor;
        const containerId = isInstructor ? 'remote-instructor-container' : 'remote-students-container';
        const remoteVideosContainer = document.getElementById(containerId);
        console.log(`[handleRemoteStream] ${containerId} 존재? ${!!remoteVideosContainer}`);
        
        if (!remoteVideosContainer) {
            console.error(`[handleRemoteStream] ${containerId}를 찾을 수 없습니다!`);
            return;
        }

        const videoContainer = document.createElement('div');
        videoContainer.id = `remote-video-${remoteUserId}`;
        videoContainer.className = 'video-tile remote';
        
        // 강의자인 경우 instructor 클래스 추가
        if (isInstructor) {
            videoContainer.classList.add('instructor');
        }

        const video = document.createElement('video');
        video.id = `remote-video-element-${remoteUserId}`;
        video.autoplay = true;
        video.playsinline = true;
        video.muted = false;
        video.style.width = '100%';
        video.style.height = '100%';

        // ✅ 비디오 라벨에 강의자 태그 추가
        const label = document.createElement('div');
        label.className = 'video-label';
        
        if (isInstructor) {
            label.innerHTML = `${remoteUserName} <span class="instructor-badge">강의자</span>`;
            console.log(`👨‍🏫 강의자 라벨 추가: ${remoteUserName}`);
        } else {
            label.textContent = remoteUserName;
        }

        // ✅ 미디어 상태 아이콘 컨테이너 (비디오 위에 표시)
        const mediaStateIcons = document.createElement('div');
        mediaStateIcons.id = `remote-media-icons-${remoteUserId}`;
        mediaStateIcons.className = 'remote-media-icons';
        mediaStateIcons.style.position = 'absolute';
        mediaStateIcons.style.bottom = '10px';
        mediaStateIcons.style.right = '10px';
        mediaStateIcons.style.display = 'flex';
        mediaStateIcons.style.gap = '6px';
        mediaStateIcons.style.zIndex = '10';

        videoContainer.appendChild(video);
        videoContainer.appendChild(label);
        videoContainer.appendChild(mediaStateIcons);
        
        // ✅ videoContainer를 relative 위치로 설정 (절대 위치 자식 배치)
        videoContainer.style.position = 'relative';

        remoteVideosContainer.appendChild(videoContainer);
        console.log(`[handleRemoteStream] 비디오 컨테이너 생성 완료: ${remoteUserId}`);

        state.remoteUsers[remoteUserId].videoElement = video;
        
        // ✅ 초기 미디어 상태 아이콘 설정 (항상 표시, 미디어 상태 없으면 기본값 사용)
        const mediaState = userInfo || {};
        updateRemoteVideoMediaStateNew(
            remoteUserId, 
            mediaState.isVideoEnabled !== undefined ? mediaState.isVideoEnabled : true,
            mediaState.isAudioEnabled !== undefined ? mediaState.isAudioEnabled : true
        );
        console.log(`[handleRemoteStream] 초기 미디어 아이콘 설정: ${remoteUserId}`);
    }

    const video = state.remoteUsers[remoteUserId].videoElement;
    if (video) {
        try {
            video.srcObject = stream;
            console.log(`[handleRemoteStream] srcObject 설정 완료, autoplay로 진행`);
            // autoplay 속성으로 자동 재생되므로 play() 호출 생략
            // play()를 호출하면 srcObject 변경 시 중단될 수 있음
        } catch (error) {
            console.error(`[handleRemoteStream] srcObject 설정 오류:`, error);
        }
    } else {
        console.error(`[handleRemoteStream] 비디오 엘리먼트를 찾을 수 없습니다: ${remoteUserId}`);
    }
}

function removeRemoteUser(remoteUserId) {
    try {
        // ✅ Peer connection 종료 (다른 네트워크도 안전하게 정리)
        if (state.peerConnections[remoteUserId]) {
            const pc = state.peerConnections[remoteUserId];
            
            // 모든 sender 정리
            try {
                pc.getSenders().forEach(sender => {
                    sender.track?.stop();
                });
            } catch (e) {
                console.warn('Sender 정리 오류:', e.message);
            }
            
            // 모든 receiver 정리
            try {
                pc.getReceivers().forEach(receiver => {
                    receiver.track?.stop();
                });
            } catch (e) {
                console.warn('Receiver 정리 오류:', e.message);
            }
            
            // 모든 트랜시버 정리
            try {
                pc.getTransceivers().forEach(transceiver => {
                    if (transceiver) {
                        try {
                            transceiver.stop();
                        } catch (e) {
                            // transceiver stop 실패는 무시
                        }
                    }
                });
            } catch (e) {
                console.warn('Transceiver 정리 오류:', e.message);
            }
            
            // 연결 종료
            pc.close();
            delete state.peerConnections[remoteUserId];
            console.log(`✅ Peer connection 정리 완료: ${remoteUserId}`);
        }
    } catch (error) {
        console.error(`❌ Peer connection 정리 오류: ${remoteUserId}`, error.message);
    }

    try {
        // 원격 스트림 정리
        if (state.remoteUsers[remoteUserId]) {
            const stream = state.remoteUsers[remoteUserId].stream;
            if (stream) {
                stream.getTracks().forEach(track => {
                    track.stop();
                });
            }
            delete state.remoteUsers[remoteUserId];
            console.log(`✅ 원격 스트림 정리 완료: ${remoteUserId}`);
        }
    } catch (error) {
        console.error(`❌ 원격 스트림 정리 오류: ${remoteUserId}`, error.message);
    }

    try {
        // 비디오 요소 제거
        const videoContainer = document.getElementById(`remote-video-${remoteUserId}`);
        if (videoContainer) {
            videoContainer.remove();
            console.log(`✅ 비디오 요소 제거 완료: ${remoteUserId}`);
        }
    } catch (error) {
        console.error(`❌ 비디오 요소 제거 오류: ${remoteUserId}`, error.message);
    }

    try {
        // 데이터 채널 정리
        if (state.dataChannels[remoteUserId]) {
            const channels = Array.from(state.dataChannels[remoteUserId]);
            channels.forEach(channel => {
                if (channel && channel.readyState === 'open') {
                    channel.close();
                }
            });
            delete state.dataChannels[remoteUserId];
            console.log(`✅ 데이터 채널 정리 완료: ${remoteUserId}`);
        }
    } catch (error) {
        console.error(`❌ 데이터 채널 정리 오류: ${remoteUserId}`, error.message);
    }
}

// ========== 비디오/오디오 제어 ==========
function toggleVideo() {
    state.isVideoEnabled = !state.isVideoEnabled;

    state.localStream.getVideoTracks().forEach(track => {
        track.enabled = state.isVideoEnabled;
    });

    const btn = document.getElementById('toggle-video-btn');
    btn.classList.toggle('off', !state.isVideoEnabled);

    showNotification(`카메라 ${state.isVideoEnabled ? '켜짐' : '꺼짐'}`);
    
    // ✅ 모든 사용자에게 상태 변경 알림
    state.socket.emit('user-media-state-change', {
        roomId: state.roomId,
        userId: state.socket.id,
        userName: state.userName,
        isVideoEnabled: state.isVideoEnabled,
        isAudioEnabled: state.isAudioEnabled
    });
}

function toggleAudio() {
    state.isAudioEnabled = !state.isAudioEnabled;

    state.localStream.getAudioTracks().forEach(track => {
        track.enabled = state.isAudioEnabled;
    });

    const btn = document.getElementById('toggle-audio-btn');
    btn.classList.toggle('off', !state.isAudioEnabled);
    
    showNotification(`마이크 ${state.isAudioEnabled ? '켜짐' : '꺼짐'}`);
    
    // ✅ 모든 사용자에게 상태 변경 알림
    state.socket.emit('user-media-state-change', {
        roomId: state.roomId,
        userId: state.socket.id,
        userName: state.userName,
        isVideoEnabled: state.isVideoEnabled,
        isAudioEnabled: state.isAudioEnabled
    });
}

// ========== 화면 공유 ==========
async function toggleScreenShare() {
    // ✅ 다른 사람이 화면공유 중이면 실행 거부
    if (state.currentScreenShareUserId && state.currentScreenShareUserId !== state.socket.id) {
        showNotification('이미 다른 사람이 화면을 공유 중입니다', 'warning');
        return;
    }

    if (state.isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

async function startScreenShare() {
    try {
        // ✅ 보안 컨텍스트 확인
        if (!isSecureContext()) {
            showNotification('⚠️ 화면 공유는 HTTPS 또는 localhost에서만 가능합니다', 'error');
            console.warn('화면 공유는 HTTPS/localhost 환경에서만 작동합니다');
            return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        }).catch(error => {
            // ✅ 권한 오류 처리
            const errorMsg = handleMediaError(error, 'getDisplayMedia');
            throw new Error(errorMsg);
        });

        state.screenStream = screenStream;
        state.isScreenSharing = true;
        state.currentScreenShareUserId = state.socket.id;  // ✅ 자신의 ID로 설정
        
        console.log(`🖥️ 화면 공유 시작: ${screenStream.getTracks().length}개 트랙`);

        // 화면 공유 UI 표시
        const video = document.getElementById('screen-share-video');
        video.srcObject = screenStream;

        document.getElementById('screen-share-container').style.display = 'flex';
        document.getElementById('screen-share-user-name').textContent = state.userName;
        document.getElementById('screen-share-btn').classList.add('active');

        // ✅ 모든 Peer connection에 화면 스트림 전송 (await 포함)
        const screenVideoTrack = screenStream.getVideoTracks()[0];
        
        for (const remoteUserId of Object.keys(state.peerConnections)) {
            const pc = state.peerConnections[remoteUserId];
            const senders = pc.getSenders();
            
            for (const sender of senders) {
                try {
                    if (sender.track && sender.track.kind === 'video') {
                        console.log(`🔄 Peer ${remoteUserId}에 화면 트랙 전송 중...`);
                        await sender.replaceTrack(screenVideoTrack);
                        console.log(`✅ Peer ${remoteUserId}에 화면 트랙 전송 완료`);
                    }
                } catch (peerError) {
                    console.error(`❌ Peer ${remoteUserId} 화면 트랙 전송 실패:`, peerError.message);
                    // 한 peer 실패 시에도 계속 진행
                }
            }
        }

        // 서버에 화면 공유 시작 알림
        state.socket.emit('start-screen-share', {
            roomId: state.roomId,
            userName: state.userName
        });

        // ✅ close 버튼 활성화 (본인만 닫을 수 있음)
        document.getElementById('close-screen-share-btn').disabled = false;

        // ✅ 알림 제거 (불편함)
        // showNotification('화면 공유 시작');

        // ✅ 화면 공유 스트림 종료 감지 (사용자가 브라우저 화면공유 UI에서 "중지")
        screenStream.getVideoTracks()[0].onended = () => {
            console.log('🛑 사용자가 화면 공유를 중지함');
            if (state.isScreenSharing) {
                stopScreenShare();
            }
        };
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            console.log('💡 사용자가 화면 공유를 취소함');
        } else {
            const errorMsg = error.message || '화면 공유 중 오류가 발생했습니다';
            showNotification(errorMsg, 'error');
            console.error('❌ 화면 공유 오류:', error);
        }
    }
}

async function stopScreenShare() {
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
        state.screenStream = null;
    }

    state.isScreenSharing = false;
    state.currentScreenShareUserId = null;  // ✅ 화면공유 사용자 초기화

    // ✅ 원본 카메라 스트림으로 복구 (개선된 버전)
    try {
        console.log('🎥 카메라 스트림으로 복구 시작...');
        
        // ✅ state.localStream에서 화면 트랙 제거
        const videoTracks = state.localStream.getVideoTracks();
        console.log(`📌 로컬 스트림 비디오 트랙: ${videoTracks.length}개`);
        
        if (videoTracks.length === 0) {
            console.error('❌ 로컬 스트림에 비디오 트랙이 없습니다!');
            throw new Error('카메라 스트림을 사용할 수 없습니다');
        }

        const cameraTrack = videoTracks[0];
        console.log(`✅ 카메라 트랙 선택: ${cameraTrack.id}`);

        // ✅ 모든 Peer Connection 송신자 업데이트 (await 포함)
        let updateCount = 0;
        for (const remoteUserId of Object.keys(state.peerConnections)) {
            const pc = state.peerConnections[remoteUserId];
            const senders = pc.getSenders();
            
            for (const sender of senders) {
                try {
                    if (sender.track?.kind === 'video') {
                        console.log(`🔄 Peer ${remoteUserId}의 비디오 트랙 복구 중...`);
                        await sender.replaceTrack(cameraTrack);
                        console.log(`✅ Peer ${remoteUserId}의 비디오 트랙 복구 완료`);
                        updateCount++;
                    }
                } catch (peerError) {
                    console.error(`❌ Peer ${remoteUserId} 트랙 복구 실패:`, peerError.message);
                    // 한 peer 실패 시에도 계속 진행
                }
            }
        }

        console.log(`📊 총 ${updateCount}개 Peer 업데이트 완료`);

        // ✅ 로컬 비디오 요소 업데이트 (UI 갱신)
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = state.localStream;
            console.log('✅ 로컬 비디오 요소 업데이트 완료');
        }

    } catch (error) {
        console.error('❌ 카메라 복구 오류:', error.message);
        
        let userMsg = '카메라 복구 중 오류가 발생했습니다';
        if (!isSecureContext()) {
            userMsg = '⚠️ 보안 조건에서만 화면 공유 복구가 가능합니다';
        } else if (error.message.includes('비디오 트랙이 없습니다')) {
            userMsg = '❌ 카메라 접근이 불가능합니다. 다시 참여해주세요';
        }
        
        showNotification(userMsg, 'error');
    }

    document.getElementById('screen-share-container').style.display = 'none';
    document.getElementById('screen-share-btn').classList.remove('active');

    // ✅ close 버튼 비활성화 (화면 공유 종료)
    document.getElementById('close-screen-share-btn').disabled = true;

    // 서버에 화면 공유 종료 알림
    state.socket.emit('stop-screen-share', {
        roomId: state.roomId
    });

    // ✅ 알림 제거 (불편함)
    // showNotification('화면 공유 종료');
}

function closeScreenShare() {
    // ✅ 수정: 화면 공유를 켠 사람만 끌 수 있음
    if (state.currentScreenShareUserId !== state.socket.id) {
        // 다른 사람이 화면 공유 중이면 닫을 수 없음
        showNotification('화면 공유를 켠 사람만 끌 수 있습니다', 'warning');
        return;
    }
    
    stopScreenShare();
}

function handleScreenShareStart(userId, userName) {
    // 원격 사용자의 화면 공유 표시
    console.log(`[handleScreenShareStart] ${userName}의 화면 공유 시작`);
    
    const screenShareContainer = document.getElementById('screen-share-container');
    const screenShareVideo = document.getElementById('screen-share-video');
    
    if (!screenShareContainer || !screenShareVideo) {
        console.error('[handleScreenShareStart] 화면 공유 컨테이너 또는 비디오 엘리먼트를 찾을 수 없습니다');
        return;
    }

    // 해당 사용자의 비디오 요소에서 스트림 가져오기
    const remoteVideoElement = document.getElementById(`remote-video-element-${userId}`);
    
    if (remoteVideoElement && remoteVideoElement.srcObject) {
        console.log(`[handleScreenShareStart] 원격 비디오 스트림을 화면 공유 영역으로 설정`);
        screenShareVideo.srcObject = remoteVideoElement.srcObject;
        screenShareContainer.style.display = 'flex';
        document.getElementById('screen-share-user-name').textContent = userName;
        
        // ✅ close 버튼 비활성화 (다른 사람이 화면공유 중이므로 이 사용자는 닫을 수 없음)
        document.getElementById('close-screen-share-btn').disabled = true;
        
        screenShareVideo.play().catch(err => {
            console.error(`[handleScreenShareStart] play() 오류:`, err);
        });
    } else {
        console.warn(`[handleScreenShareStart] 원격 비디오 엘리먼트 또는 스트림을 찾을 수 없습니다: ${userId}`);
    }
}

function handleScreenShareEnd(userId) {
    const screenShareContainer = document.getElementById('screen-share-container');
    const screenShareVideo = document.getElementById('screen-share-video');
    
    // 화면 공유 컨테이너 숨기기
    if (screenShareContainer) {
        screenShareContainer.style.display = 'none';
    }
    
    // 화면 공유 영상 정리
    if (screenShareVideo && screenShareVideo.srcObject) {
        screenShareVideo.srcObject = null;
    }
    
    // ✅ close 버튼 비활성화 (화면 공유가 종료되었으므로)
    document.getElementById('close-screen-share-btn').disabled = true;
    
    console.log(`화면 공유 종료`);
}

// ========== 채팅 ==========
let selectedImageData = null;

// ✅ 추가: 참석 상태 추적 (강의자 전용)
const attendanceStatus = {};

function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const message = input.value.trim();

    if (!message && !selectedImageData) return;

    console.log(`[채팅 전송] 강의자 여부: ${state.isInstructor}, 사용자명: ${state.userName}`);

    state.socket.emit('send-message', {
        roomId: state.roomId,
        message: message,
        userName: state.userName,
        isInstructor: state.isInstructor,
        timestamp: Date.now(),  // ✅ 타임스탬프 추가 (밀리초 단위 숫자)
        imageData: selectedImageData
    });

    input.value = '';
    clearImagePreview();
}

function addChatMessage(userId, userName, message, timestamp, isInstructor = false, imageData = null) {
    console.log(`[채팅 수신] 사용자 ID: ${userId}, 사용자명: ${userName}, 강의자: ${isInstructor}, 메시지: ${message}`);
    
    // ✅ 사용자명 업데이트 (이름 변경 추적용)
    state.userNames[userId] = userName;
    
    const messagesContainer = document.getElementById('chat-messages');

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';

    // ✅ userId 기반으로 색깔 적용 (이름 변경해도 색깔 유지)
    const userColor = getUserColor(userId);
    messageEl.style.borderLeft = `4px solid ${userColor}`;

    const header = document.createElement('div');
    header.className = 'chat-message-header';
    
    // ✅ 사용자명 색깔 지정
    header.style.color = userColor;
    
    if (isInstructor) {
        console.log(`[강의자 태그 추가] ${userName}`);
        header.innerHTML = `${userName} <span class="instructor-badge">강의자</span>`;
    } else {
        header.textContent = userName;
    }

    const content = document.createElement('div');
    content.textContent = message;

    messageEl.appendChild(header);

    // 이미지가 있으면 표시
    if (imageData) {
        const imageEl = document.createElement('img');
        imageEl.src = imageData;
        imageEl.className = 'chat-image';
        
        // 이미지 클릭 시 확대 모달 열기
        imageEl.addEventListener('click', () => {
            openImageModal(imageData);
        });
        
        messageEl.appendChild(imageEl);
    }

    // ✅ 수정: timestamp 유효성 검사 및 포맷
    const time = document.createElement('div');
    time.className = 'chat-message-time';
    
    let timeString = '시간 미지정';
    
    // timestamp가 숫자인지 확인 (Date.now()의 결과)
    if (typeof timestamp === 'number' && timestamp > 0) {
        timeString = new Date(timestamp).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    } else if (typeof timestamp === 'string' && timestamp.length > 0) {
        // 백엔드에서 이미 포맷된 시간이 오는 경우 (호환성)
        timeString = timestamp;
    } else if (timestamp instanceof Date && !isNaN(timestamp)) {
        timeString = timestamp.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    } else {
        console.warn(`⚠️ 유효하지 않은 timestamp: ${timestamp} (타입: ${typeof timestamp})`);
        // 시간 없이 진행
        timeString = '';
    }
    
    time.textContent = timeString;

    messageEl.appendChild(content);
    messageEl.appendChild(time);

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ✅ 파일 선택 처리 (네트워크 최적화)
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) return;

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
        showNotification('이미지 파일만 첨부 가능합니다', 'error');
        return;
    }

    // ✅ 파일 크기 확인 (1MB 이하 - WebRTC 채널 최적화)
    const MAX_SIZE = 1 * 1024 * 1024;  // 1MB
    if (file.size > MAX_SIZE) {
        showNotification(`⚠️ 이미지 크기는 ${MAX_SIZE / 1024 / 1024}MB 이하여야 합니다 (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)\n이미지를 압축하거나 크기를 줄여주세요`, 'error');
        return;
    }

    // FileReader로 이미지 데이터 읽기
    const reader = new FileReader();
    
    reader.onerror = () => {
        console.error('❌ 파일 읽기 오류:', reader.error);
        showNotification('파일을 읽을 수 없습니다', 'error');
    };
    
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        
        // ✅ 데이터 크기 재확인 (Base64 인코딩 후 크기 증가)
        if (dataUrl.length > 1.5 * 1024 * 1024) {
            showNotification('⚠️ 압축된 이미지도 너무 큽니다. 더 작은 이미지를 선택해주세요', 'error');
            return;
        }
        
        selectedImageData = dataUrl;
        console.log(`📸 이미지 선택됨 (크기: ${(dataUrl.length / 1024).toFixed(1)}KB)`);
        displayImagePreview(selectedImageData);
    };
    
    reader.readAsDataURL(file);
}

// 이미지 미리보기 표시
function displayImagePreview(imageData) {
    const previewArea = document.getElementById('image-preview-area');
    const previewImage = document.getElementById('preview-image');
    
    previewImage.src = imageData;
    previewArea.style.display = 'block';
}

// 이미지 미리보기 제거
function clearImagePreview() {
    selectedImageData = null;
    const previewArea = document.getElementById('image-preview-area');
    previewArea.style.display = 'none';
    
    // 파일 입력 초기화
    const fileInput = document.getElementById('file-input');
    fileInput.value = '';
}

// 이미지 확대 모달 열기
function openImageModal(imageData) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    
    modalImage.src = imageData;
    modal.classList.add('active');
    modal.style.display = 'flex';
}

// 이미지 확대 모달 닫기
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    modal.style.display = 'none';
}

// ========== 참여자 관리 ==========
function updateParticipantCount() {
    const count = document.getElementById('participants-list').children.length;
    document.getElementById('participant-count').textContent = count;
}

function addParticipantToList(userId, userName, isInstructor = false, isVideoEnabled = true, isAudioEnabled = true) {
    const listEl = document.getElementById('participants-list');

    let participantEl = document.getElementById(`participant-${userId}`);
    if (!participantEl) {
        participantEl = document.createElement('div');
        participantEl.id = `participant-${userId}`;
        participantEl.className = 'participant-item';
        
        // 참여자 이름 + 강의자 배지
        const nameContainer = document.createElement('div');
        nameContainer.className = 'participant-name-container';
        nameContainer.textContent = userName;
        
        if (isInstructor) {
            const badge = document.createElement('span');
            badge.className = 'instructor-badge';
            badge.textContent = '강의자';
            nameContainer.appendChild(badge);
        }
        
        participantEl.appendChild(nameContainer);

        // ✅ 추가: 강의자에게만 출석 상태 버튼 표시
        if (state.isInstructor && !isInstructor) {
            // 강의자가 다른 참여자를 보는 경우: 출석 버튼 표시
            const attendanceContainer = document.createElement('div');
            attendanceContainer.className = 'attendance-buttons';
            attendanceContainer.id = `attendance-${userId}`;

            // 출석 버튼
            const presentBtn = document.createElement('button');
            presentBtn.className = 'attendance-btn present-btn';
            presentBtn.textContent = '출석';
            presentBtn.addEventListener('click', () => setAttendance(userId, 'present'));

            // 결석 버튼
            const absentBtn = document.createElement('button');
            absentBtn.className = 'attendance-btn absent-btn';
            absentBtn.textContent = '결석';
            absentBtn.addEventListener('click', () => setAttendance(userId, 'absent'));

            // 지각 버튼
            const lateBtn = document.createElement('button');
            lateBtn.className = 'attendance-btn late-btn';
            lateBtn.textContent = '지각';
            lateBtn.addEventListener('click', () => setAttendance(userId, 'late'));

            attendanceContainer.appendChild(presentBtn);
            attendanceContainer.appendChild(absentBtn);
            attendanceContainer.appendChild(lateBtn);
            participantEl.appendChild(attendanceContainer);

            // 초기 상태: 모든 버튼 회색
            attendanceStatus[userId] = null;
        }

        listEl.appendChild(participantEl);
    }
}

// ✅ 추가: 출석 상태 설정 함수
function setAttendance(userId, status) {
    attendanceStatus[userId] = status;

    const attendanceContainer = document.getElementById(`attendance-${userId}`);
    if (!attendanceContainer) return;

    // 모든 버튼 초기화 (회색)
    const allBtns = attendanceContainer.querySelectorAll('.attendance-btn');
    allBtns.forEach(btn => {
        btn.classList.remove('active', 'present', 'absent', 'late');
    });

    // 선택된 버튼만 활성화
    if (status === 'present') {
        attendanceContainer.querySelector('.present-btn').classList.add('active', 'present');
    } else if (status === 'absent') {
        attendanceContainer.querySelector('.absent-btn').classList.add('active', 'absent');
    } else if (status === 'late') {
        attendanceContainer.querySelector('.late-btn').classList.add('active', 'late');
    }

    // ✅ 추가: Backend에 출석 체크 요청
    state.socket.emit('check-attendance', {
        roomId: state.roomId,
        userId: userId,
        status: status
    });

    console.log(`[출석 체크] ${userId}: ${status} - Backend로 전송`);
}

function removeParticipantFromList(userId) {
    const participantEl = document.getElementById(`participant-${userId}`);
    if (participantEl) {
        participantEl.remove();
    }
    
    // ✅ 추가: 참석 상태 데이터 삭제
    delete attendanceStatus[userId];
}

// ========== 탭 전환 ==========
function switchTab(e) {
    const tabName = e.target.dataset.tab;
    const tabElement = document.getElementById(`${tabName}-tab`);

    // ✅ 수정: 탭 요소가 없으면 에러 방지
    if (!tabElement) {
        console.warn(`탭 요소를 찾을 수 없습니다: ${tabName}-tab`);
        return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    e.target.classList.add('active');
    tabElement.classList.add('active');
}

// ✅ 익명화 버튼 클릭시
function activateAnonymousMode() {
    console.log('🔵 activateAnonymousMode 함수 호출됨');
    console.log('📊 state.isInstructor:', state.isInstructor);
    console.log('📊 state.socket:', state.socket ? '존재함' : 'null');
    console.log('📊 state.socket.connected:', state.socket?.connected);
    console.log('📊 state.socket.id:', state.socket?.id);
    console.log('📊 state.roomId:', state.roomId);
    
    if (!state.isInstructor) {
        console.log('❌ 강의자가 아님!');
        showNotification('강의자만 익명화를 활성화할 수 있습니다', 'error');
        return;
    }

    if (!state.socket) {
        console.error('❌ Socket 객체가 null입니다!');
        showNotification('Socket 연결 오류', 'error');
        return;
    }

    if (!state.socket.connected) {
        console.error('❌ Socket이 연결되지 않았습니다!', state.socket.connected);
        showNotification('Socket 연결 끊김', 'error');
        return;
    }

    // Backend에 익명 모드 활성화 요청
    console.log('📤 Backend에 activate-anonymous-mode 전송 중...');
    console.log('📡 roomId:', state.roomId);
    
    const emitStartTime = Date.now();
    
    state.socket.emit('activate-anonymous-mode', {
        roomId: state.roomId
    }, (error) => {
        const emitDuration = Date.now() - emitStartTime;
        if (error) {
            console.error(`❌ [${emitDuration}ms] emit 콜백 에러:`, error);
        } else {
            console.log(`✅ [${emitDuration}ms] emit 콜백 도착 - 에러 없음`);
        }
    });

    console.log('✅ 익명 모드 활성화 요청 전송 완료: ' + state.roomId);
    showNotification('🎭 익명 모드를 활성화했습니다', 'success');
}

// ✅ 강의실 코드 복사 (HTTPS/localhost 폴백 지원)
function copyRoomCode() {
    const roomCode = document.getElementById('current-room-id').textContent;
    const copyBtn = document.getElementById('copy-room-code-btn');
    
    // 1️⃣ Clipboard API 지원 확인
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomCode).then(() => {
            showCopySuccess(copyBtn, roomCode);
        }).catch(error => {
            console.warn('⚠️ Clipboard API 실패:', error);
            // 폴백: 수동 선택 방식
            fallbackCopyToClipboard(roomCode, copyBtn);
        });
    } else {
        // 2️⃣ Clipboard API 미지원 → 폴백 방식
        console.log('⚠️ Clipboard API 미지원 (비보안 컨텍스트) → 폴백 사용');
        fallbackCopyToClipboard(roomCode, copyBtn);
    }
}

// ✅ 복사 성공 애니메이션
function showCopySuccess(btn, code) {
    const originalText = btn.textContent;
    btn.textContent = '✅';
    btn.classList.add('copied');
    showNotification(`"${code}" 복사되었습니다! ✅`, 'success');
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
    }, 2000);
}

// ✅ 폴백: 텍스트 영역을 이용한 복사
function fallbackCopyToClipboard(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
        textarea.select();
        document.execCommand('copy');
        showCopySuccess(btn, text);
    } catch (error) {
        console.error('❌ 폴백 복사 실패:', error);
        showNotification('복사 실패. 수동으로 코드를 복사해주세요: ' + text, 'error');
    } finally {
        document.body.removeChild(textarea);
    }
}

// ========== 회의 종료 ==========
// ========== 방 떠나기 ==========
// ✅ 일반 퇴장 (사용자가 버튼 클릭 시 - 확인창 포함)
function leaveConference() {
    if (!confirm('회의를 종료하시겠습니까?')) return;

    // 강제 퇴장과 동일한 처리
    forceLeaveConference('사용자가 방을 나갔습니다');
}

// ✅ 강제 퇴장 (강의자 퇴장 시 - 확인창 없음)
function forceLeaveConference(reason = '방이 폐쇄되었습니다') {
    console.log(`🛑 강제 퇴장 시작: ${reason}`);

    // 화면 공유 중지
    if (state.isScreenSharing) {
        try {
            stopScreenShare();
        } catch (error) {
            console.warn('화면 공유 중지 중 오류:', error.message);
        }
    }

    // ✅ 모든 Peer connection 종료 (개선된 정리)
    try {
        for (const remoteUserId in state.peerConnections) {
            const pc = state.peerConnections[remoteUserId];
            if (pc) {
                try {
                    // Sender 정리
                    pc.getSenders().forEach(sender => {
                        try {
                            sender.track?.stop();
                        } catch (e) {
                            // 무시
                        }
                    });

                    // Receiver 정리
                    pc.getReceivers().forEach(receiver => {
                        try {
                            receiver.track?.stop();
                        } catch (e) {
                            // 무시
                        }
                    });

                    // 연결 종료
                    pc.close();
                } catch (error) {
                    console.warn(`Peer ${remoteUserId} 정리 중 오류:`, error.message);
                }
            }
        }
        state.peerConnections = {};
    } catch (error) {
        console.error('Peer connection 정리 중 오류:', error);
    }

    // 로컬 스트림 종료
    if (state.localStream) {
        try {
            state.localStream.getTracks().forEach(track => track.stop());
        } catch (error) {
            console.warn('로컬 스트림 정리 중 오류:', error.message);
        }
        state.localStream = null;
    }

    // ✅ 서버에 방 나가기 알림 (비동기 처리)
    if (state.socket && state.socket.connected) {
        try {
            state.socket.emit('leave-room', {
                roomId: state.roomId,
                userName: state.userName,
                reason: reason
            });
            console.log('✅ 서버에 퇴장 알림 전송');
        } catch (error) {
            console.warn('서버 알림 전송 중 오류:', error.message);
        }
    }

    // 연결 상태 초기화
    state.roomId = null;
    state.userName = null;
    state.isInstructor = false;

    // ✅ UI 정리 (즉시 실행)
    try {
        document.getElementById('conference-container').classList.remove('active');
        document.getElementById('login-container').classList.add('active');

        // 폼 초기화
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('participants-list').innerHTML = '';
        document.getElementById('remote-instructor-container').innerHTML = '';
        document.getElementById('remote-students-container').innerHTML = '';
        document.getElementById('room-info').style.display = 'none';
        
        console.log('✅ UI 정리 완료');
    } catch (error) {
        console.error('UI 정리 중 오류:', error.message);
    }

    showNotification(reason || '회의가 종료되었습니다');
}

// ========== 알림 ==========
function showNotification(message, type = 'info') {
    // ✅ 타입별 아이콘 설정
    const icons = {
        'success': '✅',
        'error': '❌',
        'info': 'ℹ️',
        'warning': '⚠️'
    };
    
    const icon = icons[type] || 'ℹ️';
    const displayMessage = `${icon} ${message}`;
    
    // ✅ 콘솔에도 표시
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // ✅ 사용자에게 alert로 표시 (에러/경고는 alert, 정보는 콘솔만)
    if (type === 'error' || type === 'warning') {
        alert(displayMessage);
    }
}

// ========== 사이드바 토글 ==========
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    state.isSidebarVisible = !state.isSidebarVisible;
    
    if (state.isSidebarVisible) {
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
    }
}

// ========== 제어 바 토글 ==========
function toggleControlBar() {
    const controlBar = document.querySelector('.control-bar');
    const toggleBtn = document.getElementById('control-bar-toggle-btn');
    
    state.isControlBarVisible = !state.isControlBarVisible;
    
    if (state.isControlBarVisible) {
        // 패널 표시
        controlBar.classList.remove('hidden');
        toggleBtn.classList.remove('hidden');
        toggleBtn.textContent = '▼';
        toggleBtn.title = '제어 바 숨김';
    } else {
        // 패널 숨김
        controlBar.classList.add('hidden');
        toggleBtn.classList.add('hidden');
        toggleBtn.textContent = '▲';
        toggleBtn.title = '제어 바 표시';
    }
}

// ✅ 사용자 미디어 상태 업데이트
function updateParticipantMediaState(userId, userName, isVideoEnabled, isAudioEnabled) {
    const mediaStateContainer = document.getElementById(`media-state-${userId}`);
    
    if (!mediaStateContainer) {
        console.warn(`미디어 상태 컨테이너 없음: ${userId}`);
        return;
    }
    
    // 기존 상태 아이콘 제거
    mediaStateContainer.innerHTML = '';
    
    // 카메라 상태 아이콘
    const cameraIcon = document.createElement('span');
    cameraIcon.className = 'media-icon camera-icon';
    cameraIcon.title = isVideoEnabled ? '카메라 켜짐' : '카메라 꺼짐';
    cameraIcon.textContent = isVideoEnabled ? '�️' : '❌';
    cameraIcon.style.opacity = isVideoEnabled ? '1' : '0.5';
    
    // 마이크 상태 아이콘
    const micIcon = document.createElement('span');
    micIcon.className = 'media-icon mic-icon';
    micIcon.title = isAudioEnabled ? '마이크 켜짐' : '마이크 꺼짐';
    micIcon.textContent = isAudioEnabled ? '🎙️' : '❌';
    micIcon.style.opacity = isAudioEnabled ? '1' : '0.5';
    
    mediaStateContainer.appendChild(cameraIcon);
    mediaStateContainer.appendChild(micIcon);
    
    console.log(`📡 ${userName}의 미디어 상태 업데이트: 카메라=${isVideoEnabled}, 마이크=${isAudioEnabled}`);
}

// ✅ 원격 비디오 화면 위의 미디어 아이콘 업데이트
function updateRemoteVideoMediaState(userId, isVideoEnabled, isAudioEnabled) {
    const mediaStateContainer = document.getElementById(`remote-media-icons-${userId}`);
    
    if (!mediaStateContainer) {
        console.warn(`원격 미디어 아이콘 컨테이너 없음: ${userId}`);
        return;
    }
    
    // 기존 아이콘 제거
    mediaStateContainer.innerHTML = '';
    
    // 카메라 상태 아이콘
    const cameraIcon = document.createElement('span');
    cameraIcon.className = 'media-icon camera-icon';
    cameraIcon.title = isVideoEnabled ? '카메라 켜짐' : '카메라 꺼짐';
    cameraIcon.textContent = isVideoEnabled ? '�️' : '❌';
    cameraIcon.style.fontSize = '24px';
    mediaStateContainer.appendChild(cameraIcon);
    mediaStateContainer.appendChild(micIcon);
    
    console.log(`🎥 원격 사용자 ${userId}의 비디오 위 미디어 아이콘 업데이트: 카메라=${isVideoEnabled}, 마이크=${isAudioEnabled}`);
}

// ✅ 원격 비디오 화면 위의 미디어 아이콘 업데이트 (새 함수)
function updateRemoteVideoMediaStateNew(userId, isVideoEnabled, isAudioEnabled) {
    const mediaStateContainer = document.getElementById(`remote-media-icons-${userId}`);
    
    if (!mediaStateContainer) return;
    
    mediaStateContainer.innerHTML = '';
    
    // 카메라 버튼
    const cameraBtn = document.createElement('button');
    cameraBtn.className = 'remote-control-btn camera-btn';
    cameraBtn.classList.toggle('camera-off', !isVideoEnabled);
    cameraBtn.disabled = true;
    
    const cameraIconActive = document.createElement('span');
    cameraIconActive.className = 'icon';
    cameraIconActive.textContent = '🖥️';
    cameraBtn.appendChild(cameraIconActive);
    
    const cameraIconDisabled = document.createElement('span');
    cameraIconDisabled.className = 'icon-disabled';
    cameraIconDisabled.textContent = '❌';
    cameraBtn.appendChild(cameraIconDisabled);
    
    // 마이크 버튼
    const audioBtn = document.createElement('button');
    audioBtn.className = 'remote-control-btn audio-btn';
    audioBtn.classList.toggle('audio-off', !isAudioEnabled);
    audioBtn.disabled = true;
    
    const audioIconActive = document.createElement('span');
    audioIconActive.className = 'icon';
    audioIconActive.textContent = '🎙️';
    audioBtn.appendChild(audioIconActive);
    
    const audioIconDisabled = document.createElement('span');
    audioIconDisabled.className = 'icon-disabled';
    audioIconDisabled.textContent = '❌';
    audioBtn.appendChild(audioIconDisabled);
    
    mediaStateContainer.appendChild(cameraBtn);
    mediaStateContainer.appendChild(audioBtn);
}

// ✅ 로컬 비디오 위의 미디어 아이콘 업데이트
function updateLocalMediaIcons(isVideoEnabled, isAudioEnabled) {
    const mediaStateContainer = document.getElementById('local-media-icons');
    
    if (!mediaStateContainer) return;
    
    mediaStateContainer.innerHTML = '';
    
    // 카메라 버튼
    const cameraBtn = document.createElement('button');
    cameraBtn.className = 'remote-control-btn camera-btn';
    cameraBtn.classList.toggle('camera-off', !isVideoEnabled);
    cameraBtn.disabled = true;
    
    const cameraIconActive = document.createElement('span');
    cameraIconActive.className = 'icon';
    cameraIconActive.textContent = '🖥️';
    cameraBtn.appendChild(cameraIconActive);
    
    const cameraIconDisabled = document.createElement('span');
    cameraIconDisabled.className = 'icon-disabled';
    cameraIconDisabled.textContent = '❌';
    cameraBtn.appendChild(cameraIconDisabled);
    
    // 마이크 버튼
    const audioBtn = document.createElement('button');
    audioBtn.className = 'remote-control-btn audio-btn';
    audioBtn.classList.toggle('audio-off', !isAudioEnabled);
    audioBtn.disabled = true;
    
    const audioIconActive = document.createElement('span');
    audioIconActive.className = 'icon';
    audioIconActive.textContent = '🎙️';
    audioBtn.appendChild(audioIconActive);
    
    const audioIconDisabled = document.createElement('span');
    audioIconDisabled.className = 'icon-disabled';
    audioIconDisabled.textContent = '❌';
    audioBtn.appendChild(audioIconDisabled);
    
    mediaStateContainer.appendChild(cameraBtn);
    mediaStateContainer.appendChild(audioBtn);
}

async function refineQuestion() {
    const question = document.getElementById('chat-message-input').value.trim();
    
    if (!question) {
        return;
    }

    const btn = document.getElementById('refine-question-btn');
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
        // 백엔드 API 호출 (타임아웃 포함)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

        const response = await fetch(`${BACKEND_URL}/api/refine-question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: question }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error || `API 오류: ${response.status}`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        
        if (!data.refinedQuestion) {
            throw new Error('응답이 올바르지 않습니다');
        }

        const refinedQuestion = data.refinedQuestion;
        
        state.suggestedQuestion = refinedQuestion;
        
        // 제안 영역 표시
        document.getElementById('suggestion-text').textContent = refinedQuestion;
        document.getElementById('suggestion-area').style.display = 'block';
        
    } catch (error) {
        console.error('❌ 질문 다듬기 오류:', error.message);
        
        let userMessage = '질문 다듬기 중 오류가 발생했습니다';
        
        // 오류 유형별 메시지
        if (error.name === 'AbortError') {
            userMessage = '요청 시간 초과 (10초). 네트워크를 확인해주세요.';
        } else if (error.message.includes('API 키')) {
            userMessage = 'OpenAI API 설정이 필요합니다. 관리자에게 문의해주세요.';
        } else if (error.message.includes('429')) {
            userMessage = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
        } else if (error.message.includes('401')) {
            userMessage = 'API 인증 오류. 관리자에게 문의해주세요.';
        } else if (!navigator.onLine) {
            userMessage = '네트워크 연결이 끊어졌습니다.';
        }
        
        showNotification(userMessage, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '✨';
    }
}

function acceptSuggestion() {
    if (state.suggestedQuestion) {
        document.getElementById('chat-message-input').value = state.suggestedQuestion;
        document.getElementById('suggestion-area').style.display = 'none';
        state.suggestedQuestion = null;
        
        // 자동으로 전송하지 않고 사용자가 버튼을 눌러서 전송하도록 함
    }
}

function rejectSuggestion() {
    document.getElementById('suggestion-area').style.display = 'none';
    state.suggestedQuestion = null;
}

// ========== 이름 관리 메뉴 ==========
function toggleUsernameMenu() {
    const menu = document.getElementById('username-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function renameUsername() {
    const newName = prompt('새로운 이름을 입력하세요:', state.userName);
    
    if (newName && newName.trim()) {
        const trimmedName = newName.trim();
        state.userName = trimmedName;
        
        // 1. 로컬 UI에 새로운 이름 표시
        document.getElementById('local-username').textContent = trimmedName;
        
        // 2. 참여자 목록에서 자신의 이름 업데이트
        const participantEl = document.getElementById(`participant-${state.socket.id}`);
        if (participantEl) {
            const nameContainer = participantEl.querySelector('.participant-name-container');
            if (nameContainer) {
                // 기존 배지나 다른 자식 요소 보존
                const children = Array.from(nameContainer.childNodes);
                nameContainer.textContent = trimmedName;
                // 배지가 있었다면 다시 추가
                children.forEach(child => {
                    if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('instructor-badge')) {
                        nameContainer.appendChild(child.cloneNode(true));
                    }
                });
            }
        }
        
        // 3. 메뉴 닫기
        document.getElementById('username-menu').style.display = 'none';
        
        // 4. 다른 사용자들에게 이름 변경 알림 (오류 처리 포함)
        if (state.socket) {
            try {
                state.socket.emit('username-changed', {
                    roomId: state.roomId,
                    userId: state.socket.id,
                    newName: trimmedName
                });
                showNotification(`이름이 "${trimmedName}"으로 변경되었습니다`);
            } catch (error) {
                console.error('❌ 이름 변경 전송 오류:', error);
                // 로컬 UI 업데이트는 되었으므로 경고만 표시
                showNotification(`이름이 로컬에서만 변경되었습니다. 네트워크 오류를 확인해주세요.`, 'error');
            }
        }
    }
}

// ========== 퀴즈 기능 ==========
function createQuiz() {
    console.log('🔍 createQuiz() 함수 시작');
    
    const questionInput = document.getElementById('quiz-question-input');
    const question = questionInput.value.trim();
    console.log('📝 입력된 문제:', question);
    
    // ✅ 라디오 버튼 검색 및 확인
    const correctAnswerRadios = document.querySelectorAll('input[name="quiz-answer-form"]');
    console.log('🔍 찾은 라디오 버튼 개수:', correctAnswerRadios.length);
    
    let correctAnswer = null;
    
    for (const radio of correctAnswerRadios) {
        console.log(`📻 라디오 버튼 - value: ${radio.value}, checked: ${radio.checked}`);
        if (radio.checked) {
            correctAnswer = radio.value;
            break;
        }
    }
    
    console.log('✅ 최종 정답:', correctAnswer);
    
    if (!question) {
        console.warn('⚠️ 문제를 입력하지 않음');
        return;
    }

    if (!correctAnswer) {
        console.warn('⚠️ 정답을 선택하지 않음');
        alert('정답을 선택해주세요'); // ✅ 정답 검증 알림만 활성화
        return;
    }
    
    if (!state.isInstructor) {
        showNotification('강의자만 퀴즈를 출제할 수 있습니다', 'error');
        return;
    }

    // ✅ 각 퀴즈에 고유 ID 생성
    const quizId = `quiz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // ✅ 퀴즈 번호 미리 계산
    const quizNumber = state.quizHistory.length + 1;

    const quizData = {
        question: question,
        correctAnswer: correctAnswer,
        roomId: state.roomId,
        quizId: quizId,  // ✅ 백엔드로 quizId 전송
        quizNumber: quizNumber  // ✅ 퀴즈 번호도 함께 전송
    };

    // 백엔드로 퀴즈 전송
    state.socket.emit('quiz-created', quizData);
    console.log('📤 퀴즈 출제:', quizData);

    // 로컬 상태 업데이트 (socket 이벤트에서 displayQuiz가 호출되므로 여기서는 상태만 업데이트)
    state.currentQuiz = {
        question: question,
        correctAnswer: correctAnswer,
        timestamp: Date.now(),
        quizId: quizId,
        instructorId: state.socket.id
    };
    state.correctAnswer = correctAnswer;
    // ✅ 수정: 새 퀴즈의 응답 객체 생성
    if (!state.quizAnswers[quizId]) {
        state.quizAnswers[quizId] = {};
    }
    state.hasAnsweredQuiz = false;

    // ✅ 출제 기록에 추가 (응답 결과 초기화)
    const quizHistoryEntry = {
        quizId: quizId,
        question: question,
        correctAnswer: correctAnswer,
        timestamp: Date.now(),
        instructorName: state.userName,
        quizNumber: state.quizHistory.length + 1,
        oCount: 0,
        xCount: 0
    };
    
    state.quizHistory.push(quizHistoryEntry);

    // ✅ 출제 기록 화면에 표시
    addQuizToHistory(quizHistoryEntry);
    console.log('✅ 로컬 출제 기록 추가됨:', quizHistoryEntry);

    // UI 업데이트: 입력폼만 초기화 (displayQuiz는 socket-quiz-created 이벤트에서 호출됨)
    questionInput.value = '';
    
    // 라디오 버튼 초기화
    correctAnswerRadios.forEach(radio => radio.checked = false);
}

function displayQuiz(question, quizNumber) {
    // 🔢 퀴즈 번호 (외부에서 전달받거나 로컬에서 계산)
    if (!quizNumber) {
        quizNumber = state.quizHistory[state.quizHistory.length - 1]?.quizNumber || 1;
    }
    
    // 채팅창에 퀴즈 문제 표시 (퀴즈 번호와 함께)
    addChatMessage('시스템', `❓ 퀴즈 ${quizNumber}`, question, Date.now(), false);
    
    // 채팅 메시지 영역에 O/X 버튼 추가
    const chatMessages = document.getElementById('chat-messages');
    
    const quizButtonContainer = document.createElement('div');
    // ✅ 수정: 고유한 quiz ID를 가진 data 속성 추가
    quizButtonContainer.className = 'chat-quiz-buttons';
    quizButtonContainer.setAttribute('data-quiz-id', state.currentQuiz.quizId);
    quizButtonContainer.innerHTML = `
        <div class="quiz-btn-row">
            <button class="chat-quiz-btn o-btn" data-answer="O">
                <span class="btn-icon">⭕</span>
                <span class="btn-text">O를 누른 사람수</span>
                <span class="quiz-count-o">0</span>
            </button>
            <button class="chat-quiz-btn x-btn" data-answer="X">
                <span class="btn-icon">❌</span>
                <span class="btn-text">X를 누른 사람수</span>
                <span class="quiz-count-x">0</span>
            </button>
        </div>
    `;
    
    // ✅ 수정: 이벤트 리스너 추가 (각 버튼 독립적 처리)
    const buttons = quizButtonContainer.querySelectorAll('.chat-quiz-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // ✅ 비활성화된 버튼 체크
            if (btn.disabled) {
                showNotification('이 선택지는 선택할 수 없습니다', 'warning');
                return;
            }
            
            const answer = btn.getAttribute('data-answer');
            const quizId = quizButtonContainer.getAttribute('data-quiz-id');
            submitAnswerFromChat(answer, quizId);
        });
    });
    
    chatMessages.appendChild(quizButtonContainer);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function submitAnswer(answer) {
    if (!state.currentQuiz) {
        showNotification('진행 중인 퀴즈가 없습니다', 'error');
        return;
    }

    if (state.hasAnsweredQuiz) {
        showNotification('이미 응답했습니다', 'info');
        return;
    }

    const answerData = {
        roomId: state.roomId,
        userId: state.socket.id,
        userName: state.userName,
        answer: answer
    };

    // 백엔드로 응답 전송
    state.socket.emit('quiz-answer', answerData);
    console.log('📤 퀴즈 응답 제출:', answerData);

    // 로컬 상태 업데이트 (퀴즈별 사용자 응답 저장)
    const quizId = state.currentQuiz.quizId;
    if (!state.quizAnswers[quizId]) {
        state.quizAnswers[quizId] = {};
    }
    state.quizAnswers[quizId][state.socket.id] = answer;
    state.hasAnsweredQuiz = true;

    showNotification(`${answer}를 선택했습니다`, 'success');
}

// 채팅에서의 응답 처리
function submitAnswerFromChat(answer, quizId) {
    // ✅ 수정: 매개변수에서 받은 quizId 사용
    if (!quizId) {
        showNotification('퀴즈 ID를 찾을 수 없습니다', 'error');
        return;
    }

    // ✅ 상태 확인: 이미 결과가 표시되면 답변 불가 (알림 표시)
    if (state.quizStatuses[quizId] === 'finished') {
        showNotification('이 퀴즈는 이미 종료되었습니다. 더 이상 답변할 수 없습니다', 'warning');
        return;
    }

    const previousAnswer = state.quizAnswers[quizId] ? state.quizAnswers[quizId][state.socket.id] : null;
    
    const answerData = {
        roomId: state.roomId,
        userId: state.socket.id,
        userName: state.userName,
        answer: answer,
        quizId: quizId,
        previousAnswer: previousAnswer || null
    };

    // 백엔드로 응답 전송
    state.socket.emit('quiz-answer', answerData);
    console.log('📤 퀴즈 응답 제출 (채팅):', answerData);

    // 로컬 상태 업데이트 (퀴즈별 사용자 응답 저장)
    if (!state.quizAnswers[quizId]) {
        state.quizAnswers[quizId] = {};
    }
    state.quizAnswers[quizId][state.socket.id] = answer;
    state.hasAnsweredQuiz = true;
    
    // ✅ 수정: 매개변수 받은 quizId로 해당 컨테이너 찾기
    const quizContainer = document.querySelector(`[data-quiz-id="${quizId}"]`);
    
    if (quizContainer) {
        // 현재 퀴즈 컨테이너 내의 모든 버튼에서 selected 제거
        const buttons = quizContainer.querySelectorAll('.chat-quiz-btn');
        buttons.forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // 현재 퀴즈 컨테이너 내에서만 선택된 버튼에 highlight 추가
        const selectedBtn = answer === 'O' 
            ? quizContainer.querySelector('.chat-quiz-btn.o-btn')
            : quizContainer.querySelector('.chat-quiz-btn.x-btn');
        
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        console.log(`✅ 퀴즈 ${quizId} 응답 선택: ${answer}`);
    } else {
        console.warn(`⚠️ quizId ${quizId}에 해당하는 컨테이너를 찾을 수 없습니다`);
    }

    console.log(`✅ 퀴즈 응답 선택: ${answer}, 이전 응답: ${previousAnswer || 'None'}`);
}

function showQuizResults() {
    if (!state.isInstructor) {
        showNotification('강의자만 결과를 볼 수 있습니다', 'error');
        return;
    }

    if (!state.currentQuiz) {
        showNotification('진행 중인 퀴즈가 없습니다', 'error');
        return;
    }

    // ✅ 현재 퀴즈의 quizId 가져오기
    const quizId = state.currentQuiz.quizId;

    // 백엔드에 이 퀴즈의 결과 요청
    state.socket.emit('quiz-results-request', {
        roomId: state.roomId,
        quizId: quizId  // ✅ 추가: 어느 퀴즈의 결과인지 명확히
    });

    console.log(`📤 퀴즈 결과 요청 - quizId: ${quizId}`);
}

function displayQuizResults(results, quizId, correctAnswer) {
    console.log('📊 퀴즈 결과:', results, 'quizId:', quizId, '정답:', correctAnswer);
    console.log('🔍 현재 state.quizAnswers 전체:', state.quizAnswers);
    console.log('🔍 현재 사용자 ID:', state.socket.id);

    // ✅ 강의자만 강의자 패널 업데이트 (학생은 이 요소들이 없음)
    if (state.isInstructor) {
        const currentQuizDisplay = document.getElementById('current-quiz-display');
        const quizCreatorSection = document.getElementById('quiz-creator-section');
        const quizResultsSection = document.getElementById('quiz-results-section');
        
        if (currentQuizDisplay) currentQuizDisplay.style.display = 'none';
        if (quizCreatorSection) quizCreatorSection.style.display = 'block';
        if (quizResultsSection) quizResultsSection.style.display = 'block';

        const totalAnswers = results.oCount + results.xCount;
        const oPercentage = totalAnswers > 0 ? (results.oCount / totalAnswers) * 100 : 0;
        const xPercentage = totalAnswers > 0 ? (results.xCount / totalAnswers) * 100 : 0;

        // 결과 표시 업데이트
        const resultOCount = document.getElementById('result-o-count');
        const resultXCount = document.getElementById('result-x-count');
        const resultOBar = document.getElementById('result-o-bar');
        const resultXBar = document.getElementById('result-x-bar');
        
        if (resultOCount) resultOCount.textContent = results.oCount;
        if (resultXCount) resultXCount.textContent = results.xCount;
        if (resultOBar) resultOBar.style.width = oPercentage + '%';
        if (resultXBar) resultXBar.style.width = xPercentage + '%';
    }

    // ✅ 모든 사용자(강의자 + 학생): 채팅창의 O/X 버튼 색칠
    const chatMessagesContainer = document.getElementById('chat-messages');
    const quizButtonContainers = chatMessagesContainer.querySelectorAll('.chat-quiz-buttons');
    
    console.log(`🎯🎯🎯 displayQuizResults 시작: quizId=${quizId}`);
    console.log(`   quizButtonContainers 개수: ${quizButtonContainers.length}`);
    
    // 🔍 각 컨테이너의 data-quiz-id 확인
    quizButtonContainers.forEach((container, idx) => {
        console.log(`   [${idx}] data-quiz-id="${container.getAttribute('data-quiz-id')}"`);
    });
    
    if (quizButtonContainers.length > 0) {
        // ✅ 수정: quizId로 정확한 퀴즈 버튼 컨테이너 찾기
        const targetQuizContainer = document.querySelector(`.chat-quiz-buttons[data-quiz-id="${quizId}"]`);
        
        if (!targetQuizContainer) {
            console.error(`   ❌ quizId="${quizId}"인 컨테이너를 찾을 수 없습니다! data-quiz-id 속성이 제대로 설정되지 않았을 수 있습니다.`);
            return;
        }
        
        console.log(`   ✓ targetQuizContainer 찾음`);
        console.log(`   컨테이너 HTML:`, targetQuizContainer.outerHTML.substring(0, 300));
        
        const oBtns = targetQuizContainer.querySelectorAll('.o-btn');
        const xBtns = targetQuizContainer.querySelectorAll('.x-btn');

        // ✅ 색칠 로직: 강의자 vs 학생 다르게 처리
        console.log(`🎨 색칠 시작 - quizId=${quizId}, 강의자?=${state.isInstructor}`);
        console.log(`   state.quizAnswers[${quizId}]:`, state.quizAnswers[quizId]);
        console.log(`   correctAnswer=${correctAnswer}`);
        
        if (state.isInstructor) {
            // ✅ 강의자: 정답 버튼만 초록색으로 표시
            const correctBtn = correctAnswer === 'O'
                ? targetQuizContainer.querySelector('.chat-quiz-btn.o-btn')
                : targetQuizContainer.querySelector('.chat-quiz-btn.x-btn');
            
            if (correctBtn) {
                correctBtn.setAttribute('style', 'background-color: rgba(76, 175, 80, 0.5) !important; color: white !important;');
                console.log(`   ✅ 강의자 화면: 정답(${correctAnswer}) 버튼 초록색`);
            }
        } else {
            // ✅ 학생: 자신의 답변 색칠
            const userAnswer = state.quizAnswers[quizId] ? state.quizAnswers[quizId][state.socket.id] : null;
            console.log(`   학생의 답: ${userAnswer}`);
            
            if (userAnswer) {
                const isCorrect = userAnswer === correctAnswer;
                
                const targetBtn = userAnswer === 'O'
                    ? targetQuizContainer.querySelector('.chat-quiz-btn.o-btn')
                    : targetQuizContainer.querySelector('.chat-quiz-btn.x-btn');
                
                if (targetBtn) {
                    if (isCorrect) {
                        targetBtn.setAttribute('style', 'background-color: rgba(76, 175, 80, 0.5) !important; color: white !important;');
                        console.log(`   ✅ 학생 화면: 자신의 답(${userAnswer}) 초록색 (정답)`);
                    } else {
                        targetBtn.setAttribute('style', 'background-color: rgba(244, 67, 54, 0.5) !important; color: white !important;');
                        console.log(`   ❌ 학생 화면: 자신의 답(${userAnswer}) 빨간색 (오답)`);
                    }
                    targetBtn.classList.remove('selected');
                }
            } else {
                console.log(`   ℹ️ 학생이 이 퀴즈에 답변하지 않음`);
            }
        }
    }
}

// ✅ 출제 기록에 퀴즈 추가
function addQuizToHistory(quizEntry) {
    const quizHistoryList = document.getElementById('quiz-history-list');
    if (!quizHistoryList) {
        console.warn('quiz-history-list 요소를 찾을 수 없습니다');
        return;
    }

    const { quizId, question, correctAnswer, timestamp, quizNumber = '?', oCount = 0, xCount = 0 } = quizEntry;
    
    // ✅ timestamp 유효성 검사
    let timeString = '시간 미지정';
    if (typeof timestamp === 'number' && timestamp > 0) {
        timeString = new Date(timestamp).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    } else if (typeof timestamp === 'string' && timestamp.length > 0) {
        timeString = timestamp;
    } else {
        console.warn(`⚠️ 퀴즈 시간 정보 오류: ${timestamp} (타입: ${typeof timestamp})`);
    }
    
    const quizItem = document.createElement('div');
    quizItem.className = 'quiz-history-item';
    quizItem.setAttribute('data-quiz-id', quizId);
    // ✅ 수정: 각 퀴즈마다 고유한 라디오 버튼 name 사용
    quizItem.innerHTML = `
        <div class="quiz-history-content">
            <div class="quiz-history-question">${quizNumber}. ${escapeHtml(question)}</div>
            <div class="quiz-history-answer">
                정답: ${correctAnswer === 'O' ? '⭕' : '❌'}
            </div>
            <div class="quiz-history-time">${timeString}</div>
        </div>
        <button class="quiz-result-btn" onclick="showQuizResult('${quizId}')">
            📊 결과<span class="result-badge">${oCount + xCount}</span>
        </button>
    `;
    
    quizHistoryList.insertBefore(quizItem, quizHistoryList.firstChild);
    console.log('✅ 퀴즈 기록 추가됨:', question);
}

// ✅ 퀴즈 결과 표시
function showQuizResult(quizId) {
    const quizEntry = state.quizHistory.find(q => q.quizId === quizId);
    
    if (!quizEntry) {
        showNotification('퀴즈를 찾을 수 없습니다', 'error');
        return;
    }
    
    // ✅ 백엔드에 결과 요청 (모든 학생들에게 데이터 broadcast)
    state.socket.emit('quiz-results-request', {
        roomId: state.roomId,
        quizId: quizId  // 특정 퀴즈 결과만 요청
    });
    
    // ✅ 이 퀴즈의 상태를 'finished'로 변경 (학생들의 답변 차단)
    state.quizStatuses[quizId] = 'finished';
    console.log(`📊 백엔드에 ${quizId} 결과 요청 emit`);
    console.log(`🔒 ${quizId} 상태 변경: finished (답변 차단됨)`);

    const { question, correctAnswer, oCount, xCount } = quizEntry;
    const total = oCount + xCount;
    const oPercentage = total > 0 ? ((oCount / total) * 100).toFixed(1) : 0;
    const xPercentage = total > 0 ? ((xCount / total) * 100).toFixed(1) : 0;
    
    // ✅ 정답률 계산 (정답을 맞춘 사람의 비율)
    const correctCount = correctAnswer === 'O' ? oCount : xCount;
    const correctPercentage = total > 0 ? ((correctCount / total) * 100).toFixed(1) : 0;

    const resultMessage = `
❓ 문제: ${question}
정답: ${correctAnswer === 'O' ? 'O' : 'X'}

📊 응답 결과:
O: ${oCount}명 (${oPercentage}%)
X: ${xCount}명 (${xPercentage}%)
총 응답자: ${total}명

✅ 정답률: ${correctPercentage}%
    `.trim();

    alert(resultMessage);
    
    // ✅ 채팅창에서 해당 퀴즈의 버튼을 색칠
    const quizButtonContainer = document.querySelector(`.chat-quiz-buttons[data-quiz-id="${quizId}"]`);
    if (quizButtonContainer) {
        const userAnswer = state.quizAnswers[quizId] ? state.quizAnswers[quizId][state.socket.id] : null;
        if (userAnswer) {
            const isCorrect = userAnswer === correctAnswer;
            
            const targetBtn = userAnswer === 'O'
                ? quizButtonContainer.querySelector('.o-btn')
                : quizButtonContainer.querySelector('.x-btn');
            
            if (targetBtn) {
                if (isCorrect) {
                    targetBtn.setAttribute('style', 'background-color: rgba(76, 175, 80, 0.5) !important; color: white !important;');
                    console.log('✅ 정답 버튼 초록색으로 표시 (결과 버튼)');
                } else {
                    targetBtn.setAttribute('style', 'background-color: rgba(244, 67, 54, 0.5) !important; color: white !important;');
                    console.log('❌ 오답 버튼 빨간색으로 표시 (결과 버튼)');
                }
                
                // ✅ 버튼 비활성화
                targetBtn.disabled = true;
                targetBtn.style.pointerEvents = 'none';
                targetBtn.style.cursor = 'not-allowed';
                
                // ✅ 다른 버튼(선택하지 않은 버튼)도 비활성화
                const otherBtn = userAnswer === 'O'
                    ? quizButtonContainer.querySelector('.x-btn')
                    : quizButtonContainer.querySelector('.o-btn');
                
                if (otherBtn) {
                    otherBtn.disabled = true;
                    otherBtn.style.pointerEvents = 'none';
                    otherBtn.style.opacity = '0.5';
                    otherBtn.style.cursor = 'not-allowed';
                }
                
                console.log(`🔒 ${quizId} 퀴즈의 버튼이 비활성화되었습니다`);
            }
        }
    }
}

function closeQuiz() {
    state.currentQuiz = null;
    state.quizAnswers = {};
    state.hasAnsweredQuiz = false;
    state.correctAnswer = null;

    // 채팅에서 마지막 퀴즈 버튼 제거
    const chatQuizBtns = document.querySelectorAll('.chat-quiz-buttons');
    chatQuizBtns.forEach(btn => btn.remove());
    
    document.getElementById('quiz-problem-input').value = '';
}
