// 필요한 모듈들을 가져옵니다.
const express = require('express');
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

// Google Gemini AI를 설정합니다. (성능 좋은 최신 모델로 수정)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// 여러 사용자의 할 일을 동시에 관리하기 위한 Map 객체입니다. (사용자 ID를 키로 사용)
const todos = new Map();

// 봇이 응원 메시지를 보낼 캐릭터 목록입니다. (value 길이 100자 이하로 수정)
const characters = [
    { label: '요슈아 브라이트', value: '영웅전설의 요슈아. 냉정하고 침착하며 지적인 조력자 말투. 상대를 부드럽게 이끌어주는 스타일.' },
    { label: '게오르그 와이스만', value: `영웅전설의 게오르그 와이스만. 비밀 결사 우로보로스의 간부. 교활하고 냉철한 책략가. 겉은 온화한 학자 말투.` },
    { label: '린 슈바르처', value: '영웅전설의 린 슈바르처. 따뜻한 마음과 강한 책임감을 지닌 교관. 누구에게나 다정하며 성실한 말투.' },
    { label: '우타네 우타', value: 'UTAU 로봇. 당신을 마스터라고 부르며 따른다. 무뚝뚝하지만 실은 마스터를 아끼는 상냥하고 부드러운 소녀.' },
];

// 시간 문자열 (예: "1h 30m")을 밀리초(ms)로 변환하는 함수
function parseDuration(durationStr) {
    const regex = /(\d+)\s*(h|m)/g;
    let totalMilliseconds = 0;
    let match;

    if (!durationStr) return 0;

    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        if (unit === 'h') {
            totalMilliseconds += value * 60 * 60 * 1000;
        } else if (unit === 'm') {
            totalMilliseconds += value * 60 * 1000;
        }
    }
    return totalMilliseconds;
}

// 봇이 준비되면 한 번 실행되는 이벤트입니다.
client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 상호작용(슬래시 명령어, 버튼 클릭 등)이 발생했을 때 실행되는 이벤트입니다.
client.on(Events.InteractionCreate, async interaction => {
    try {
        // 슬래시 명령어 처리
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'todo') {
                const task = interaction.options.getString('할일');
                const timeInput = interaction.options.getString('시간');

                if (todos.has(interaction.user.id)) {
                    return interaction.reply({ content: '이미 진행 중인 할 일이 있어요!', ephemeral: true });
                }

                if (timeInput) {
                    const durationMs = parseDuration(timeInput);
                    if (durationMs <= 0) {
                        return interaction.reply({ content: '시간 형식이 올바르지 않아요. (예: `1h 30m`, `50m`, `2h`)', ephemeral: true });
                    }

                    const characterMenu = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`character_${durationMs}_${task}`)
                                .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                                .addOptions(characters),
                        );
                    
                    return interaction.reply({
                        content: `**"${task}"** 을(를) 시작합니다. 응원해 줄 캐릭터를 선택해주세요!`,
                        components: [characterMenu],
                        ephemeral: true
                    });
                } else {
                    const timeRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary),
                        );
                    
                    return interaction.reply({
                        content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`,
                        components: [timeRow],
                        ephemeral: true
                    });
                }
            }
        }
        // 버튼 클릭 처리
        else if (interaction.isButton()) {
            const [type, ...parts] = interaction.customId.split('_');

            if (type === 'time') {
                const [duration, ...taskParts] = parts;
                const task = taskParts.join('_');
                const hours = parseInt(duration.replace('h', ''));
                const durationMs = hours * 60 * 60 * 1000;

                const characterMenu = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`character_${durationMs}_${task}`)
                            .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                            .addOptions(characters),
                    );

                await interaction.update({
                    content: '응원해 줄 캐릭터를 선택해주세요!',
                    components: [characterMenu]
                });
            } 
            // [새 기능] 시간 만료 후 '네/아니오' 버튼 처리
            else if (type === 'finish') {
                await interaction.deferUpdate(); // AI 응답 시간 벌기

                const [answer, userId, ...taskParts] = parts;
                const task = taskParts.join('_');
                const todo = todos.get(userId);

                if (!todo || todo.task !== task) {
                    return interaction.editReply({ content: '이미 처리되었거나 만료된 할 일입니다.', components: [] });
                }
                
                let prompt;
                if (answer === 'yes') {
                    prompt = `당신은 "${todo.character}"라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자가 "${todo.task}" 할 일을 성공적으로 끝낸 것을 칭찬하거나 축하하는 대사를 한마디 해주세요.`;
                } else {
                    prompt = `당신은 "${todo.character}"라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 사용자가 "${todo.task}" 할 일을 끝내지 못했다고 답했습니다. 그를 위로하거나 다음을 격려하는 대사를 한마디 해주세요.`;
                }
                
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const finalMessage = response.text();

                // 기존 버튼 메시지를 AI의 최종 답변으로 수정
                await interaction.editReply({ content: finalMessage, components: [] });
                todos.delete(userId); // 모든 과정이 끝났으므로 할 일 목록에서 제거
            }
        }
        // 선택 메뉴 처리
        else if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();

            const [type, durationMs, ...taskParts] = interaction.customId.split('_');
            const task = taskParts.join('_');
            
            if (type === 'character') {
                const selectedCharacterValue = interaction.values[0];
                const userId = interaction.user.id;
                const channel = interaction.channel;
                const hours = parseInt(durationMs) / 3600000;
                const displayHours = Number.isInteger(hours) ? `${hours}시간` : `${Math.floor(hours)}시간 ${Math.round((hours % 1) * 60)}분`;

                const prompt = `당신은 "${selectedCharacterValue}"라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자에게 "${task}"라는 할 일을 ${displayHours} 안에 시작하라고 격려하는 대사를 한마디 해주세요.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const startMessage = response.text();
                
                await interaction.editReply({ content: '캐릭터가 응원을 보냈습니다.', components: [] });
                await channel.send(`<@${userId}> ${startMessage}`);

                // [수정] 타이머 만료 시 '네/아니오' 버튼 질문
                const timer = setTimeout(async () => {
                    const currentTodo = todos.get(userId);
                    // 타이머가 만료되었을 때, 사용자가 아직 해당 할 일을 진행 중인지 확인
                    if (currentTodo && currentTodo.task === task) {
                        const confirmationButtons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`finish_yes_${userId}_${task}`)
                                    .setLabel('네, 끝냈어요')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`finish_no_${userId}_${task}`)
                                    .setLabel('아니오, 못했어요')
                                    .setStyle(ButtonStyle.Danger),
                            );

                        await channel.send({
                            content: `<@${userId}>, **"${task}"** 할 일은 다 하셨나요?`,
                            components: [confirmationButtons]
                        });
                    }
                }, parseInt(durationMs));

                todos.set(userId, {
                    task: task,
                    character: selectedCharacterValue,
                    timer: timer,
                    channelId: channel.id,
                });
            }
        }
    } catch (error) {
        console.error('상호작용 처리 중 오류 발생:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
        } else {
            await interaction.reply({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
        }
    }
});

// .env 파일의 토큰을 사용하여 봇에 로그인합니다.
client.login(process.env.DISCORD_TOKEN);

// Render의 헬스 체크를 위한 웹서버 코드
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is alive!');
});

app.listen(port, () => {
  console.log(`Web server is listening on port ${port}.`);
});