// --- 1. 웹 서버 설정 (파일 최상단에 위치해야 합니다) ---
const express = require('express');
const app = express();
// Render가 환경 변수로 PORT를 제공하면 그것을 사용하고, 아니면 3000번을 사용합니다.
const port = process.env.PORT || 3000;

// 기본 경로('/')로 접속하면 간단한 응답을 보냅니다.
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// 설정된 포트에서 웹 서버를 시작합니다.
// 이 코드가 실행되어야 Render가 서비스가 정상이라고 판단합니다.
app.listen(port, () => {
  console.log(`Web server started and listening on port ${port}`);
});


// --- 2. 디스코드 봇 설정 (기존 코드) ---
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
// [수정!] 현재 안정적인 최신 모델 이름으로 변경했습니다.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); 

const todos = new Map();

const characters = [
    { label: '요슈아 브라이트', value: '《영웅전설 하늘의 궤적 FC》의 요슈아 브라이트는 주인공 에스텔 브라이트의 파트너이자 의붓남매로, 냉정하고 침착한 성격의 소유자입니다. 그는 활발하고 다소 충동적인 에스텔의 곁에서 항상 한발 앞서 상황을 분석하고 조언을 아끼지 않는 이성적인 면모를 보입니다. 뛰어난 통찰력과 빠른 두뇌 회전으로 사건의 본질을 꿰뚫어 보며, 덜렁거리는 에스텔을 돕고 바로잡는 든든한 조력자 역할을 합니다. 평소에는 부드럽고 온화한 태도를 유지하지만, 전투 시에는 쌍검을 사용하여 빈틈없는 공격을 펼치는 등 강인한 모습도 갖추고 있습니다. 이처럼 요슈아는 에스텔의 부족한 점을 채워주는 최고의 파트너로서 그녀와 함께 성장해 나가는 섬세하고 지적인 인물입니다.' },
    { label: '엄격한 교관', value: '군대 교관처럼 엄격하지만 속은 따뜻한 교관' },
    { label: '다정한 선배', value: '언제나 다정하게 챙겨주는 대학교 선배' },
    { label: '츤데레 친구', value: '겉으로는 틱틱대지만 속으로는 챙겨주는 친구' },
];

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 상호작용 이벤트 리스너
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const commandName = interaction.commandName;
        if (commandName === 'todo') {
            const task = interaction.options.getString('할일');
            if (todos.has(interaction.user.id)) {
                await interaction.reply({ content: '이미 진행 중인 할 일이 있어요! 먼저 `/done` 명령어로 완료해주세요.', ephemeral: true });
                return;
            }
            const timeRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_custom_${task}`).setLabel('직접입력(미구현)').setStyle(ButtonStyle.Secondary).setDisabled(true),
                );
            await interaction.reply({
                content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`,
                components: [timeRow],
                ephemeral: true
            });
        } else if (commandName === 'done') {
            const userId = interaction.user.id;
            const todo = todos.get(userId);
            if (todo) {
                clearTimeout(todo.timer);
                
                // [프롬프트 수정!] AI가 대사만 말하도록 명확하게 지시합니다.
                const prompt = `너는 지금부터 '${todo.character}' 캐릭터야. 사용자가 '${todo.task}' 할 일을 성공적으로 끝냈어. 이 상황에 맞는 축하 대사를 딱 한 문장만 한국어로 말해줘. 다른 설명은 절대 추가하지 마.`;
                
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const congratulationMessage = response.text();
                
                await interaction.reply(`🎉 **"${todo.task}"** 완료!`);
                await interaction.followUp(congratulationMessage);
                todos.delete(userId);
            } else {
                await interaction.reply({ content: '진행 중인 할 일이 없어요!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        const [type, duration, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');
        if (type === 'time') {
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
    } else if (interaction.isStringSelectMenu()) {
        const [type, durationMs, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');
        if (type === 'character') {
            await interaction.deferUpdate();
            const selectedCharacterValue = interaction.values[0];
            const selectedCharacterLabel = characters.find(c => c.value === selectedCharacterValue).label;
            const userId = interaction.user.id;
            const channel = interaction.channel;
            
            // [프롬프트 수정!] AI가 대사만 말하도록 명확하게 지시합니다.
            const prompt = `너는 지금부터 '${selectedCharacterValue}' 캐릭터야. 사용자가 '${task}' 할 일을 앞으로 ${parseInt(durationMs) / 3600000}시간 안에 끝내야 해. 이 상황에 맞는 응원 대사를 딱 한 문장만 한국어로 말해줘. 다른 설명은 절대 추가하지 마.`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const startMessage = response.text();
            
            await interaction.followUp({ content: `**${selectedCharacterLabel}** 캐릭터가 응원을 시작합니다!` });
            await channel.send(startMessage);
            
            const timer = setTimeout(async () => {
                if (todos.has(userId)) {
                    const failedTodo = todos.get(userId);
                    
                    // [프롬프트 수정!] AI가 대사만 말하도록 명확하게 지시합니다.
                    const failurePrompt = `너는 지금부터 '${failedTodo.character}' 캐릭터야. 사용자가 '${failedTodo.task}' 할 일을 시간 안에 끝내지 못했어. 이 상황에 맞게 아쉬워하거나 격려하는 대사를 딱 한 문장만 한국어로 말해줘. 다른 설명은 절대 추가하지 마.`;
                    
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


// --- 3. 봇 로그인 (파일 최하단에 위치해야 합니다) ---
// 웹 서버가 먼저 켜진 후에 디스코드 봇에 로그인합니다.
client.login(process.env.DISCORD_TOKEN);