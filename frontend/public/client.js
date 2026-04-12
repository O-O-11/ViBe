// WebRTC 설정
const RTCConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// 백엔드 서버 URL 설정
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://vibe-production-6c36.up.railway.app';

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
    isInstructor: false,
    suggestedQuestion: null,
    userColors: {}, // ✅ 사용자별 색깔 저장
    userNames: {},   // ✅ 사용자 ID → 사용자명 매핑 (이름 변경 추적용)
    // ✅ 퀴즈 관련 데이터
    currentQuiz: null,       // {question: string, correctAnswer: 'O' or 'X', timestamp: number}
    quizAnswers: {},         // {quizId: {userId: 'O' or 'X'}} - 퀴즈별 응답 추적
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

    joinRoom(userName, roomId);
}

// ========== 회의 참여 ==========
async function joinRoom(userName, roomId) {
    state.userName = userName;
    state.roomId = roomId;

    try {
        // 로컬 스트림 초기화
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });

        state.localStream = stream;

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

        // 소켓 연결 및 방 참여
        if (!state.socket) {
            state.socket = io(BACKEND_URL);
        }

        state.socket.emit('join-room', {
            roomId: roomId,
            userName: userName
        });

        showNotification(`${userName}님이 회의에 입장했습니다`, 'success');
    } catch (error) {
        showNotification('카메라/마이크 접근 권한을 확인해주세요', 'error');
        console.error('미디어 접근 오류:', error);
    }
}

// ========== 소켓 이벤트 ==========
function setupSocketEvents() {
    console.log('🔵 setupSocketEvents() 함수 시작됨');
    
    // 다른 사용자가 입장했을 때
    document.addEventListener('socket-user-joined', (e) => {
        const { userId, userName, isInstructor, totalUsers } = e.detail;
        console.log(`✅ ${userName}이 입장했습니다`);
        showNotification(`${userName}이 입장했습니다`);
        
        // Backend에서 보낸 totalUsers 직접 사용
        if (totalUsers !== undefined) {
            document.getElementById('participant-count').textContent = totalUsers;
        } else {
            updateParticipantCount();
        }
        
        addParticipantToList(userId, userName, isInstructor);

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
        addParticipantToList(state.socket.id, state.userName, state.isInstructor);
        
        // 기존 사용자 추가 및 Offer 생성
        users.forEach(user => {
            addParticipantToList(user.id, user.name, user.isInstructor);
            
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
        const { userId, userName, totalUsers } = e.detail;
        console.log(`👋 ${userName}이 퇴장했습니다`);
        showNotification(`${userName}이 퇴장했습니다`);
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
        
        // 참여자 목록에서 해당 사용자의 이름 업데이트
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
    });

    // 화면 공유 시작
    document.addEventListener('socket-screen-share-start', (e) => {
        const { userId, userName } = e.detail;
        showNotification(`${userName}님이 화면을 공유하고 있습니다`);
        state.currentScreenShareUserId = userId;
        handleScreenShareStart(userId, userName);
    });

    // 화면 공유 종료
    document.addEventListener('socket-screen-share-stop', (e) => {
        const { userId } = e.detail;
        state.currentScreenShareUserId = null;
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
        state.socket = io(BACKEND_URL);
    }

    state.socket.on('connect', () => {
        console.log('✅ 서버에 연결됨');
        console.log('✅ setupSocketEvents 호출 전에 이벤트 리스너 등록 (보험용)');
        
        // ⚠️ 보험용: 여기서도 quiz-results-data 리스너 등록
        state.socket.on('quiz-results-data', (data) => {
            console.log('🎯🎯🎯 [connect 핸들러] quiz-results-data 이벤트 받음!', data);
            displayQuizResults(data, data.quizId, data.correctAnswer);
        });
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
        const { message } = data;
        
        showNotification(message || '강의자가 나갔습니다. 방이 폐쇄됩니다.', 'error');
        
        // 2초 후 로그인 화면으로 돌아가기
        setTimeout(() => {
            leaveConference();
        }, 2000);
    });

    // 사용자 이름 변경
    state.socket.on('user-renamed', (data) => {
        const { userId, oldName, newName } = data;
        const event = new CustomEvent('socket-user-renamed', { detail: { userId, oldName, newName } });
        document.dispatchEvent(event);
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
                const localUsernameEl = document.getElementById('local-username');
                if (localUsernameEl) {
                    localUsernameEl.textContent = user.name;
                    console.log(`[익명화] 로컬 비디오 라벨 업데이트: ${user.id} → ${user.name}`);
                }
            } else {
                // ✅ 원격 사용자인 경우
                const videoContainer = document.getElementById(`remote-video-${user.id}`);
                if (videoContainer) {
                    const label = videoContainer.querySelector('.video-label');
                    if (label) {
                        label.textContent = user.name;
                        console.log(`[익명화] 비디오 label 업데이트: ${user.id} → ${user.name}`);
                    }
                }
            }
        });

        showNotification('🎭 익명 모드가 활성화되었습니다');
    });

    // ========== 퀴즈 이벤트 리스너 ==========
    // 퀴즈 출제됨
    state.socket.on('quiz-created', (data) => {
        const { quizId, question, correctAnswer, instructorName, timestamp } = data;
        console.log(`❓ 퀴즈 출제됨: ${question} (정답: ${correctAnswer}) [ID: ${quizId}]`);
        
        state.currentQuiz = {
            quizId: quizId,  // ✅ quizId 포함
            question: question,
            correctAnswer: correctAnswer,
            timestamp: timestamp || Date.now()
        };
        state.correctAnswer = correctAnswer;
        state.quizAnswers = {};
        state.hasAnsweredQuiz = false;

        displayQuiz(question);
    });

    // 퀴즈 결과
    console.log('📋 quiz-results-data 리스너 등록 중...');
    state.socket.on('quiz-results-data', (data) => {
        console.log('🎯🎯🎯 quiz-results-data 이벤트 도착!!!', data);
        const { quizId, question, correctAnswer, oCount, xCount, totalAnswers, answers } = data;
        console.log(`📊 퀴즈 결과: O=${oCount}, X=${xCount}, quizId=${quizId}, 정답=${correctAnswer}`);
        
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

    // ✅ 강의실 코드 복사
    document.getElementById('copy-room-code-btn').addEventListener('click', copyRoomCode);

    // 이름 변경 메뉴
    document.getElementById('username-menu-btn').addEventListener('click', toggleUsernameMenu);
    document.getElementById('rename-username-btn').addEventListener('click', renameUsername);

    // 질문 다듬기
    document.getElementById('refine-question-btn').addEventListener('click', refineQuestion);
    document.getElementById('accept-suggestion-btn').addEventListener('click', acceptSuggestion);
    document.getElementById('reject-suggestion-btn').addEventListener('click', rejectSuggestion);

    // 설정
    document.getElementById('settings-btn').addEventListener('click', () => {
        showNotification('설정 기능이 준비 중입니다', 'info');
    });

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
        const peerConnection = createPeerConnection(remoteUserId, remoteUserName);

        // 로컬 스트림 추가
        console.log(`[Offer] 로컬 스트림 추가 시작, track 수: ${state.localStream.getTracks().length}`);
        state.localStream.getTracks().forEach((track, idx) => {
            console.log(`[Offer] Track ${idx}: ${track.kind} - enabled: ${track.enabled}`);
            peerConnection.addTrack(track, state.localStream);
        });

        // Offer 생성
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await peerConnection.setLocalDescription(offer);

        // Offer 전송
        state.socket.emit('offer', {
            to: remoteUserId,
            from: state.socket.id,
            fromName: state.userName,
            fromIsInstructor: state.isInstructor,
            offer: offer
        });

        console.log(`📤 Offer 전송: ${remoteUserName}에게`);
    } catch (error) {
        console.error('Offer 생성 오류:', error);
    }
}

async function handleOffer(remoteUserId, remoteUserName, remoteUserIsInstructor, offer) {
    try {
        let peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            peerConnection = createPeerConnection(remoteUserId, remoteUserName);
            // ✅ 수정: 양방향 스트림을 위해 track 추가 필요
            // (Offer 받는 쪽도 자신의 스트림을 전송해야 함)
            console.log(`[handleOffer] 로컬 스트림 추가 시작, track 수: ${state.localStream.getTracks().length}`);
            state.localStream.getTracks().forEach((track, idx) => {
                console.log(`[handleOffer] Track ${idx}: ${track.kind} - enabled: ${track.enabled}`);
                peerConnection.addTrack(track, state.localStream);
            });
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Answer 생성
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Answer 전송
        state.socket.emit('answer', {
            to: remoteUserId,
            from: state.socket.id,
            answer: answer
        });

        console.log(`📥 Answer 전송: ${remoteUserName}에게`);
    } catch (error) {
        console.error('Offer 처리 오류:', error);
    }
}

async function handleAnswer(remoteUserId, answer) {
    try {
        const peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            console.error('Peer connection이 존재하지 않습니다:', remoteUserId);
            return;
        }

        console.log(`[Answer] 현재 signaling state: ${peerConnection.signalingState}`);
        
        // signaling state가 "have-local-offer" 상태일 때만 Answer를 설정
        if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn(`[Answer] 잘못된 상태에서 Answer 수신. 현재 상태: ${peerConnection.signalingState}`);
            return;
        }

        await peerConnection.setRemoteDescription(answer);
        console.log(`✅ Answer 설정됨: ${remoteUserId}`);
    } catch (error) {
        console.error('Answer 처리 오류:', error);
    }
}

async function handleIceCandidate(remoteUserId, candidate) {
    try {
        const peerConnection = state.peerConnections[remoteUserId];

        if (!peerConnection) {
            console.error('Peer connection이 존재하지 않습니다:', remoteUserId);
            return;
        }

        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('ICE 후보 추가 오류:', error);
    }
}

function createPeerConnection(remoteUserId, remoteUserName) {
    const peerConnection = new RTCPeerConnection({
        iceServers: RTCConfig.iceServers
    });

    state.peerConnections[remoteUserId] = peerConnection;

    // 로컬 ICE 후보 전송
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            state.socket.emit('ice-candidate', {
                to: remoteUserId,
                from: state.socket.id,
                candidate: event.candidate
            });
        }
    };

    // 원격 스트림 처리
    peerConnection.ontrack = (event) => {
        console.log(`🎬 원격 스트림 수신: ${remoteUserId}, track kind: ${event.track.kind}, streams: ${event.streams.length}`);
        if (event.streams && event.streams.length > 0) {
            handleRemoteStream(remoteUserId, event.streams[0], remoteUserName);
        }
    };

    // 연결 상태 변화
    peerConnection.onconnectionstatechange = () => {
        console.log(`연결 상태 (${remoteUserName}):`, peerConnection.connectionState);

        if (peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'disconnected') {
            removeRemoteUser(remoteUserId);
        }
    };

    return peerConnection;
}

function handleRemoteStream(remoteUserId, stream, remoteUserName) {
    console.log(`[handleRemoteStream] 시작, remoteUserId: ${remoteUserId}, 스트림 트랙 수: ${stream.getTracks().length}`);
    
    // 이미 존재하는 경우 videoElement 리셋 방지
    if (!state.remoteUsers[remoteUserId]) {
        state.remoteUsers[remoteUserId] = {
            stream: stream,
            name: remoteUserName,
            videoElement: null
        };

        // 원격 비디오 요소 생성
        const remoteVideosContainer = document.getElementById('remote-videos-container');
        console.log(`[handleRemoteStream] remote-videos-container 존재? ${!!remoteVideosContainer}`);
        
        if (!remoteVideosContainer) {
            console.error('[handleRemoteStream] remote-videos-container를 찾을 수 없습니다!');
            return;
        }

        let videoContainer = document.getElementById(`remote-video-${remoteUserId}`);

        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = `remote-video-${remoteUserId}`;
            videoContainer.className = 'video-tile remote';

            const video = document.createElement('video');
            video.id = `remote-video-element-${remoteUserId}`;
            video.autoplay = true;
            video.playsinline = true;
            video.muted = false;
            video.style.width = '100%';
            video.style.height = '100%';

            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = remoteUserName;

            videoContainer.appendChild(video);
            videoContainer.appendChild(label);

            remoteVideosContainer.appendChild(videoContainer);
            console.log(`[handleRemoteStream] 비디오 컨테이너 생성 완료: ${remoteUserId}`);

            state.remoteUsers[remoteUserId].videoElement = video;
        }
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
    // Peer connection 종료
    if (state.peerConnections[remoteUserId]) {
        state.peerConnections[remoteUserId].close();
        delete state.peerConnections[remoteUserId];
    }

    // 원격 사용자 제거
    if (state.remoteUsers[remoteUserId]) {
        delete state.remoteUsers[remoteUserId];
    }

    // 비디오 요소 제거
    const videoContainer = document.getElementById(`remote-video-${remoteUserId}`);
    if (videoContainer) {
        videoContainer.remove();
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

    const status = state.isVideoEnabled ? '켜기' : '끄기';
    showNotification(`카메라 ${state.isVideoEnabled ? '켜짐' : '꺼짐'}`);
}

function toggleAudio() {
    state.isAudioEnabled = !state.isAudioEnabled;

    state.localStream.getAudioTracks().forEach(track => {
        track.enabled = state.isAudioEnabled;
    });

    const btn = document.getElementById('toggle-audio-btn');
    btn.classList.toggle('off', !state.isAudioEnabled);

    showNotification(`마이크 ${state.isAudioEnabled ? '켜짐' : '꺼짐'}`);
}

// ========== 화면 공유 ==========
async function toggleScreenShare() {
    if (state.isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

async function startScreenShare() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        });

        state.screenStream = screenStream;
        state.isScreenSharing = true;

        // 화면 공유 UI 표시
        const video = document.getElementById('screen-share-video');
        video.srcObject = screenStream;

        document.getElementById('screen-share-container').style.display = 'flex';
        document.getElementById('screen-share-user-name').textContent = state.userName;
        document.getElementById('screen-share-btn').classList.add('active');

        // 모든 Peer connection에 화면 스트림 전송
        screenStream.getTracks().forEach(track => {
            state.localStream.addTrack(track);

            Object.values(state.peerConnections).forEach(pc => {
                pc.getSenders().forEach(sender => {
                    if (sender.track && sender.track.kind === track.kind) {
                        sender.replaceTrack(track);
                    }
                });
            });
        });

        // 서버에 화면 공유 시작 알림
        state.socket.emit('start-screen-share', {
            roomId: state.roomId,
            userName: state.userName
        });

        showNotification('화면 공유 시작');

        // 화면 공유 스트림 종료 감지
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
    } catch (error) {
        if (error.name !== 'NotAllowedError') {
            showNotification('화면 공유 중 오류가 발생했습니다', 'error');
            console.error('화면 공유 오류:', error);
        }
    }
}

async function stopScreenShare() {
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
        state.screenStream = null;
    }

    state.isScreenSharing = false;

    // 원본 카메라 스트림으로 복구
    state.localStream.getVideoTracks().forEach(track => {
        Object.values(state.peerConnections).forEach(pc => {
            pc.getSenders().forEach(sender => {
                if (sender.track?.kind === 'video') {
                    sender.replaceTrack(track);
                }
            });
        });
    });

    document.getElementById('screen-share-container').style.display = 'none';
    document.getElementById('screen-share-btn').classList.remove('active');

    // 서버에 화면 공유 종료 알림
    state.socket.emit('stop-screen-share', {
        roomId: state.roomId
    });

    showNotification('화면 공유 종료');
}

function closeScreenShare() {
    if (state.currentScreenShareUserId !== state.socket.id && state.currentScreenShareUserId !== null) {
        handleScreenShareEnd(state.currentScreenShareUserId);
    } else {
        stopScreenShare();
    }
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

    // ✅ 수정: timestamp를 포맷하여 시간 표시
    const time = document.createElement('div');
    time.className = 'chat-message-time';
    const timeString = new Date(timestamp).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    time.textContent = timeString;

    messageEl.appendChild(header);
    messageEl.appendChild(content);
    messageEl.appendChild(time);

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 파일 선택 처리
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) return;

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
        showNotification('이미지 파일만 첨부 가능합니다', 'error');
        return;
    }

    // 파일 크기 확인 (5MB 이하)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('이미지 크기는 5MB 이하여야 합니다', 'error');
        return;
    }

    // FileReader로 이미지 데이터 읽기
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedImageData = e.target.result;
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

function addParticipantToList(userId, userName, isInstructor = false) {
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

// ✅ 강의실 코드 복사
function copyRoomCode() {
    const roomCode = document.getElementById('current-room-id').textContent;
    const copyBtn = document.getElementById('copy-room-code-btn');
    
    navigator.clipboard.writeText(roomCode).then(() => {
        // 버튼 임시 변경
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅';
        copyBtn.classList.add('copied');
        
        showNotification(`"${roomCode}" 복사되었습니다! ✅`, 'success');
        
        // 2초 후 원래 상태로 복원
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        showNotification('복사 실패 ❌', 'error');
    });
}

// ========== 회의 종료 ==========
function leaveConference() {
    if (!confirm('회의를 종료하시겠습니까?')) return;

    // 화면 공유 중지
    if (state.isScreenSharing) {
        stopScreenShare();
    }

    // 모든 Peer connection 종료
    Object.values(state.peerConnections).forEach(pc => {
        pc.close();
    });
    state.peerConnections = {};

    // 로컬 스트림 종료
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }

    // 서버에 방 나가기 알림
    if (state.socket) {
        state.socket.emit('leave-room', {
            roomId: state.roomId,
            userName: state.userName
        });
    }

    // 로그인 화면으로 전환
    document.getElementById('conference-container').classList.remove('active');
    document.getElementById('login-container').classList.add('active');

    // 폼 초기화
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('participants-list').innerHTML = '';
    document.getElementById('remote-videos-container').innerHTML = '';
    document.getElementById('room-info').style.display = 'none';

    showNotification('회의가 종료되었습니다');
}

// ========== 알림 ==========
function showNotification(message, type = 'info') {
    return; // 알림 비활성화
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

// ========== 질문 다듬기 (백엔드 API 호출) ==========
async function refineQuestion() {
    const question = document.getElementById('chat-message-input').value.trim();
    
    if (!question) {
        return;
    }

    const btn = document.getElementById('refine-question-btn');
    btn.disabled = true;
    btn.textContent = '⏳';

    try {
        // 백엔드 API 호출
        const response = await fetch(`${BACKEND_URL}/api/refine-question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: question })
        });

        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();
        const refinedQuestion = data.refinedQuestion;
        
        state.suggestedQuestion = refinedQuestion;
        
        // 제안 영역 표시
        document.getElementById('suggestion-text').textContent = refinedQuestion;
        document.getElementById('suggestion-area').style.display = 'block';
        
    } catch (error) {
        console.error('질문 다듬기 오류:', error);
        showNotification('질문 다듬기 중 오류가 발생했습니다', 'error');
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
        
        // 4. 다른 사용자들에게 이름 변경 알림
        if (state.socket) {
            state.socket.emit('username-changed', {
                roomId: state.roomId,
                userId: state.socket.id,
                newName: trimmedName
            });
        }
        
        showNotification(`이름이 "${trimmedName}"으로 변경되었습니다`);
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

    const quizData = {
        question: question,
        correctAnswer: correctAnswer,
        roomId: state.roomId,
        quizId: quizId  // ✅ 백엔드로 quizId 전송
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

function displayQuiz(question) {
    // 채팅창에 퀴즈 문제 표시
    addChatMessage('시스템', '❓ 퀴즈', question, Date.now(), false);
    
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

    // 백엔드에 결과 조회 요청
    state.socket.emit('quiz-results-request', {
        roomId: state.roomId
    });

    console.log('📤 퀴즈 결과 요청');
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

        // ✅ 사용자가 고른 답 색상 표시 (맞으면 초록색, 틀리면 빨간색)
        console.log(`🔍 quizId=${quizId}에 해당하는 응답 찾기...`);
        console.log(`🔍 state.quizAnswers[${quizId}]:`, state.quizAnswers[quizId]);
        
        const userAnswer = state.quizAnswers[quizId] ? state.quizAnswers[quizId][state.socket.id] : null;
        console.log(`🔍 사용자 ${state.socket.id}의 응답: ${userAnswer}`);
        console.log(`🔍 정답: ${correctAnswer}`);
        
        if (userAnswer) {
            // ✅ 수정: 백엔드에서 받은 정답 직접 사용 (학생도 정답을 알 수 있음)
            const isCorrect = userAnswer === correctAnswer;
            console.log(`📊 비교: userAnswer(${userAnswer}) === correctAnswer(${correctAnswer}) ? ${isCorrect}`);
            
            // 🔍 디버깅: 선택자 테스트
            console.log('🔍🔍🔍 버튼 선택자 테스트:');
            console.log('  - .o-btn 찾음:', targetQuizContainer.querySelector('.o-btn') ? '예' : '아니오');
            console.log('  - .chat-quiz-btn.o-btn 찾음:', targetQuizContainer.querySelector('.chat-quiz-btn.o-btn') ? '예' : '아니오');
            console.log('  - .x-btn 찾음:', targetQuizContainer.querySelector('.x-btn') ? '예' : '아니오');
            console.log('  - .chat-quiz-btn.x-btn 찾음:', targetQuizContainer.querySelector('.chat-quiz-btn.x-btn') ? '예' : '아니오');
            
            const targetBtn = userAnswer === 'O'
                ? (targetQuizContainer.querySelector('.chat-quiz-btn.o-btn') || targetQuizContainer.querySelector('.o-btn'))
                : (targetQuizContainer.querySelector('.chat-quiz-btn.x-btn') || targetQuizContainer.querySelector('.x-btn'));
            
            if (targetBtn) {
                if (isCorrect) {
                    targetBtn.setAttribute('style', 'background-color: rgba(76, 175, 80, 0.5) !important; color: white !important;');
                    targetBtn.classList.remove('selected'); // 기존 선택 스타일 제거
                    console.log('✅ 정답 버튼 초록색으로 표시');
                } else {
                    targetBtn.setAttribute('style', 'background-color: rgba(244, 67, 54, 0.5) !important; color: white !important;');
                    targetBtn.classList.remove('selected'); // 기존 선택 스타일 제거
                    console.log('❌ 오답 버튼 빨간색으로 표시');
                }
            } else {
                console.warn('⚠️ targetBtn을 찾을 수 없습니다');
                console.warn('   HTML 구조:', targetQuizContainer.innerHTML);
            }
        } else {
            console.warn(`⚠️ userAnswer를 찾을 수 없습니다. state.quizAnswers[${quizId}]:`, state.quizAnswers[quizId]);
            console.warn(`⚠️ 응답이 없는 이유:`);
            console.warn(`   - state.quizAnswers[${quizId}] 존재? ${state.quizAnswers[quizId] ? '예' : '아니오'}`);
            console.warn(`   - 응답 개수: ${state.quizAnswers[quizId] ? Object.keys(state.quizAnswers[quizId]).length : 0}`);
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
    const timeString = new Date(timestamp).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
    
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
    console.log(`📊 백엔드에 ${quizId} 결과 요청 emit`);

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
