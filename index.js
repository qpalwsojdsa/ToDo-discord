// 필요한 모듈들을 가져옵니다.
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

// .env 파일의 환경 변수를 로드합니다.
dotenv.config();

// 디스코드 클라이언트(봇)를 생성합니다.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Google Gemini AI를 설정합니다.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// 할 일 목록을 저장할 Map 객체입니다. (사용자 ID를 키로 사용)
const todos = new Map();

// 봇이 응원 메시지를 보낼 캐릭터 목록입니다. 자유롭게 추가/수정하세요.
const characters = [
    { label: '활기찬 후배', value: '활기차고 명랑한 후배' },
    { label: '엄격한 교관', value: '군대 교관처럼 엄격하지만 속은 따뜻한 교관' },
    { label: '다정한 선배', value: '언제나 다정하게 챙겨주는 대학교 선배' },
    { label: '츤데레 친구', value: '겉으로는 틱틱대지만 속으로는 챙겨주는 친구' },
];

// 봇이 준비되면 한 번 실행되는 이벤트입니다.
client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 상호작용(슬래시 명령어, 버튼 클릭 등)이 발생했을 때 실행되는 이벤트입니다.
client.on(Events.InteractionCreate, async interaction => {
    // 슬래시 명령어 처리
    if (interaction.isChatInputCommand()) {
        const commandName = interaction.commandName;

        if (commandName === 'todo') {
            const task = interaction.options.getString('할일');
            
            // 이미 진행 중인 할 일이 있는지 확인
            if (todos.has(interaction.user.id)) {
                await interaction.reply({ content: '이미 진행 중인 할 일이 있어요! 먼저 `/done` 명령어로 완료해주세요.', ephemeral: true });
                return;
            }

            // 시간 선택 버튼 생성
            const timeRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_custom_${task}`).setLabel('직접입력(미구현)').setStyle(ButtonStyle.Secondary).setDisabled(true), // 직접입력은 심화과정
                );

            await interaction.reply({
                content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`,
                components: [timeRow],
                ephemeral: true // 명령어 사용자에게만 보이도록 설정
            });
        } else if (commandName === 'done') {
            const userId = interaction.user.id;
            const todo = todos.get(userId);

            if (todo) {
                // 설정된 타이머를 취소합니다.
                clearTimeout(todo.timer);

                // AI에게 완료 메시지 생성 요청
                const prompt = `${todo.character} 말투로, 사용자가 '${todo.task}' 할 일을 성공적으로 끝낸 것을 축하하는 짧은 메시지를 한국어로 작성해줘.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const congratulationMessage = response.text();

                await interaction.reply(`🎉 **"${todo.task}"** 완료!`);
                await interaction.followUp(congratulationMessage); // followUp으로 추가 메시지 전송

                // 목록에서 할 일 제거
                todos.delete(userId);
            } else {
                await interaction.reply({ content: '진행 중인 할 일이 없어요!', ephemeral: true });
            }
        }
    }
    // 버튼 클릭 처리
    else if (interaction.isButton()) {
        const [type, duration, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');

        if (type === 'time') {
            const hours = parseInt(duration.replace('h', ''));
            const durationMs = hours * 60 * 60 * 1000;

            // 캐릭터 선택 메뉴 생성
            const characterMenu = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`character_${durationMs}_${task}`)
                        .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                        .addOptions(characters),
                );

            await interaction.update({ // 기존 메시지를 수정
                content: '응원해 줄 캐릭터를 선택해주세요!',
                components: [characterMenu]
            });
        }
    }
    // 선택 메뉴 처리
else if (interaction.isStringSelectMenu()) {
    const [type, durationMs, ...taskParts] = interaction.customId.split('_');
    const task = taskParts.join('_');
    
    if (type === 'character') {
        // [수정!] 상호작용을 받자마자 "처리 중"이라고 먼저 알립니다. (시간 벌기)
        await interaction.deferUpdate();

        const selectedCharacterValue = interaction.values[0];
        const selectedCharacterLabel = characters.find(c => c.value === selectedCharacterValue).label;
        const userId = interaction.user.id;
        const channel = interaction.channel;

        // 이제 마음 편히 시간이 오래 걸리는 작업을 합니다.
        const prompt = `${selectedCharacterValue} 말투로, 사용자가 '${task}' 할 일을 ${parseInt(durationMs) / 3600000}시간 안에 시작하는 것을 응원하는 짧은 메시지를 한국어로 작성해줘.`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const startMessage = response.text();
        
        // [수정!] deferUpdate를 사용했으므로 update 대신 followUp으로 응답합니다.
        await interaction.followUp({ content: `**${selectedCharacterLabel}** 캐릭터가 응원을 시작합니다!` });
        await channel.send(startMessage); // followUp 대신 channel.send로 메시지를 보내도 깔끔합니다.

        // 타이머 설정 (이 부분은 그대로 둡니다)
        const timer = setTimeout(async () => {
            if (todos.has(userId)) {
                // ... (이하 생략)
            }
        }, parseInt(durationMs));

        // 할 일 목록에 정보 저장 (이 부분은 그대로 둡니다)
        todos.set(userId, {
            task: task,
            character: selectedCharacterValue,
            timer: timer,
            channelId: channel.id,
        });
    }
}
});

// .env 파일의 토큰을 사용하여 봇에 로그인합니다.
client.login(process.env.DISCORD_TOKEN);