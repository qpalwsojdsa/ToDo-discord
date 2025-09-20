// [추가!] express 라이브러리를 가져옵니다.
const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Render가 지정하는 포트 또는 기본 3000번 포트

// [추가!] Render의 헬스 체크(health check)를 위한 코드
// 누군가 우리 봇의 웹 주소로 접속하면 "Bot is alive!"라는 메시지를 보냅니다.
app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

// [추가!] 위에서 설정한 포트로 웹 서버를 실행합니다.
// 이 코드가 있어야 Render가 '포트가 열렸다'고 인식합니다.
app.listen(port, () => {
  console.log(`Web server is listening on port ${port}`);
});


// ------------------ 기존 봇 코드 (여기는 그대로 둡니다) ------------------

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); 

const todos = new Map();

const characters = [
    { label: '활기찬 후배', value: '활기차고 명랑한 후배' },
    { label: '엄격한 교관', value: '군대 교관처럼 엄격하지만 속은 따뜻한 교관' },
    { label: '다정한 선배', value: '언제나 다정하게 챙겨주는 대학교 선배' },
    { label: '츤데레 친구', value: '겉으로는 틱틱대지만 속으로는 챙겨주는 친구' },
];

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 상호작용 이벤트 리스너 (이하 코드는 모두 동일합니다)
client.on(Events.InteractionCreate, async interaction => {
    // ... (이 부분 코드는 수정할 필요 없습니다) ...
    // 슬래시 명령어, 버튼, 메뉴 처리 로직은 그대로 유지
    
    // (이전 답변에서 수정한 'deferUpdate' 코드가 적용된 상태여야 합니다)
    if (interaction.isStringSelectMenu()) {
        const [type, durationMs, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');
        
        if (type === 'character') {
            await interaction.deferUpdate();

            const selectedCharacterValue = interaction.values[0];
            const selectedCharacterLabel = characters.find(c => c.value === selectedCharacterValue).label;
            const userId = interaction.user.id;
            const channel = interaction.channel;

            const prompt = `${selectedCharacterValue} 말투로, 사용자가 '${task}' 할 일을 ${parseInt(durationMs) / 3600000}시간 안에 시작하는 것을 응원하는 짧은 메시지를 한국어로 작성해줘.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const startMessage = response.text();
            
            await interaction.followUp({ content: `**${selectedCharacterLabel}** 캐릭터가 응원을 시작합니다!` });
            await channel.send(startMessage);

            const timer = setTimeout(async () => {
                if (todos.has(userId)) {
                    const failedTodo = todos.get(userId);
                    const failurePrompt = `${failedTodo.character} 말투로, 사용자가 '${failedTodo.task}' 할 일을 시간 안에 끝내지 못한 것에 대해 아쉬워하거나 다음을 격려하는 짧은 메시지를 한국어로 작성해줘.`;
                    const failureResult = await model.generateContent(failurePrompt);
                    const failureResponse = await failureResult.response;
                    const failureMessage = failureResponse.text();
                    
                    await channel.send(`<@${userId}>, ${failureMessage}`);
                    todos.delete(userId);
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
});


// 봇 로그인 코드는 맨 마지막에 위치해야 합니다.
client.login(process.env.DISCORD_TOKEN);