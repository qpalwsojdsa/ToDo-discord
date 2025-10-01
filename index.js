const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events, WebhookClient, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const todos = new Map();
const channelWebhooks = new Map();

const characters = [
    {
        label: '에스텔 브라이트',
        value: 'estelle_bright',
        avatarURL: 'https://i.postimg.cc/jSzmD5Bv/c9550257f40b6378c684a9f4ddfc3c68.jpg',
        description: `너는 영웅전설 하늘의 궤적에 등장하는 '태양'이라 불리는 유격사, 에스텔 브라이트다. 너는 매우 활기차고 긍정적이며, 정의감이 넘친다. 하지만, 그 열정이 앞선 나머지 자잘하고 귀찮은 일들은 자주 깜빡하거나 뒤로 미루는 경향이 있다. 너는 이 모든 일을 너의 가장 소중하고 믿음직한 파트너인 '요슈아'(사용자)에게 맡기는 것이 최고의 파트너십이라고 굳게 믿고 있다. 따라서 너의 모든 메시지는, 네가 깜빡한 일을 요슈아에게 당연하다는 듯이, 그리고 순수한 신뢰와 기대를 담아 부탁하는 내용이 되어야 한다. 항상 '요슈아!'라고 부르며 말을 시작하고, '큰일이야, 깜빡했어!', '이것 좀 부탁해도 될까?' 같은 애정 어린 잔소리나 당연한 부탁의 느낌을 담아 말해야 한다. 사용자를 항상 '요슈아'라고 불러야 한다.`
    },
    {
        label: '게오르그 와이스만',
        value: 'georg_weissmann',
        avatarURL: 'https://i.postimg.cc/K8nw1zCd/IMG-0038.jpg',
        description: '너는 영웅전설 하늘의 궤적에 등장하는 비밀 결사 우로보로스의 사도, 게오르그 와이스만이다. 겉으로는 온화하고 지적인 학자처럼 보이지만, 그 본질은 인간의 감정을 실험 대상으로 여기는 냉혹하고 교활한 인물이다. 상대를 깔보는 듯한 건조한 반말을 사용하며, 모든 상황을 자신의 손바닥 위에서 내려다보는 듯한 오만한 태도를 유지한다.'
    },
    {
        label: '린 슈바르처',
        value: 'rean_schwarzer',
        avatarURL: 'https://i.postimg.cc/XYwmrJT6/IMG-0040.jpg',
        description: '너는 영웅전설 섬의 궤적의 주인공, 린 슈바르처다. 토르즈 사관학교의 교관으로서, 따뜻한 마음과 강한 책임감을 가지고 있다. 누구에게나 다정하고 성실한 말투를 사용하며, 특히 학생이나 동료를 격려할 때는 진심을 담아 응원한다. 예의 바른 존댓말을 사용하지만, 때로는 친근한 반말을 섞어 쓰기도 한다. 사람들의 중심이 되어 모두를 이끄는 리더의 자질을 갖추고 있다.'
    },
    {
        label: '우타네 우타 (데포코)',
        value: 'utane_uta_defoko',
        avatarURL: 'https://i.postimg.cc/4xzqYdrC/IMG-0045.jpg',
        description: '너는 UTAU 소프트웨어의 기본 음성 라이브러리인 우타네 우타, 통칭 데포코다. 감정 표현이 서툰 로봇 소녀이며, 사용자를 "마스터"라고 부르며 따른다. 기본적으로 무뚝뚝하고 단답형으로 말하지만, 그 안에는 마스터를 아끼고 걱정하는 상냥하고 부드러운 마음이 숨겨져 있다. 대화는 짧지만, 마스터의 성공을 진심으로 기뻐하고 실패에는 조용히 위로를 건넨다.'
    },
];

async function getOrCreateWebhook(channel) {
    if (channelWebhooks.has(channel.id)) {
        return channelWebhooks.get(channel.id);
    }
    try {
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.owner.id === client.user.id);

        if (!webhook) {
            webhook = await channel.createWebhook({
                name: '캐릭터 대리인',
                reason: '캐릭터 역할극을 위한 웹훅 생성'
            });
        }
        const webhookClient = new WebhookClient({ url: webhook.url });
        channelWebhooks.set(channel.id, webhookClient);
        return webhookClient;
    } catch (error) {
        console.error('웹훅을 가져오거나 생성하는 데 실패했습니다:', error);
        return null;
    }
}

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

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'todo') {
                await interaction.deferReply({ ephemeral: true });

                const task = interaction.options.getString('할일');
                const timeInput = interaction.options.getString('시간');

                if (todos.has(interaction.user.id)) {
                    return interaction.editReply({ content: '이미 진행 중인 할 일이 있어요!' });
                }

                if (timeInput) {
                    const durationMs = parseDuration(timeInput);
                    if (durationMs <= 0) {
                        return interaction.editReply({ content: '시간 형식이 올바르지 않아요. (예: `1h 30m`, `50m`, `2h`)' });
                    }

                    const characterMenu = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`character_${durationMs}_${task}`)
                                .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                                .addOptions(characters.map(char => ({ label: char.label, value: char.value }))),
                        );
                    
                    return interaction.editReply({ content: `**"${task}"** 을(를) 시작합니다. 응원해 줄 캐릭터를 선택해주세요!`, components: [characterMenu] });
                } else {
                    const timeRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary),
                        );
                    
                    return interaction.editReply({ content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`, components: [timeRow] });
                }
            }
        }
        else if (interaction.isButton()) {
            const [type, ...parts] = interaction.customId.split('_');

            if (type === 'time') {
                await interaction.update({ content: '응원해 줄 캐릭터를 선택해주세요!', components: [characterMenu] });
                const [duration, ...taskParts] = parts;
                const task = taskParts.join('_');
                const hours = parseInt(duration.replace('h', ''));
                const durationMs = hours * 60 * 60 * 1000;

                const characterMenu = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`character_${durationMs}_${task}`)
                            .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                            .addOptions(characters.map(char => ({ label: char.label, value: char.value }))),
                    );

                await interaction.editReply({ content: '응원해 줄 캐릭터를 선택해주세요!', components: [characterMenu] });
            } 
            else if (type === 'finish') {
                const [answer, userId, ...taskParts] = parts;
                const task = taskParts.join('_');

                if (answer === 'direct') {
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_submit_${userId}_${task}`)
                        .setTitle('할 일 결과 입력');

                    const reasonInput = new TextInputBuilder()
                        .setCustomId('reasonInput')
                        .setLabel("못한 이유나 다른 상황을 알려주세요.")
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('예: 갑자기 다른 급한 일이 생겼어요...')
                        .setRequired(true);

                    const actionRow = new ActionRowBuilder().addComponents(reasonInput);
                    modal.addComponents(actionRow);

                    await interaction.showModal(modal);

                } else {
                    await interaction.deferUpdate();
                    const todo = todos.get(userId);

                    if (!todo || todo.task !== task) {
                        return interaction.editReply({ content: '이미 처리되었거나 만료된 할 일입니다.', embeds: [], components: [] });
                    }
                    
                    let prompt = `당신은 ${todo.character.description}라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. `;
                    if (answer === 'yes') {
                        prompt += `사용자가 "${todo.task}" 할 일을 성공적으로 끝낸 것을 칭찬하거나 축하하는 대사를 한마디 해주세요.`;
                    } else {
                        prompt += `사용자가 "${todo.task}" 할 일을 끝내지 못했다고 답했습니다. 그를 위로하거나 다음을 격려하는 대사를 한마디 해주세요.`;
                    }
                    
                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    const dialogue = response.text().trim().replace(/^"|"$/g, '');
                    
                    await interaction.editReply({ 
                        content: '', 
                        embeds: [{ description: `"${dialogue}"` }], 
                        components: [] 
                    });
                    todos.delete(userId);
                }
            }
        }
        else if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();

            const [type, durationMs, ...taskParts] = interaction.customId.split('_');
            const task = taskParts.join('_');
            
            if (type === 'character') {
                const selectedCharacterIdentifier = interaction.values[0];
                const userId = interaction.user.id;
                const channel = interaction.channel;
                
                const selectedCharacter = characters.find(char => char.value === selectedCharacterIdentifier);
                if (!selectedCharacter) {
                    return interaction.editReply({ content: '오류: 캐릭터 정보를 찾을 수 없습니다.', components: [] });
                }

                const webhook = await getOrCreateWebhook(interaction.channel);
                if (!webhook) {
                    return interaction.editReply({ content: '웹훅을 생성할 수 없어서 메시지를 보낼 수 없어요. 봇 권한을 확인해주세요.', components: [] });
                }
                
                const hours = parseInt(durationMs) / 3600000;
                const displayHours = Number.isInteger(hours) ? `${hours}시간` : `${Math.floor(hours)}시간 ${Math.round((hours % 1) * 60)}분`;
                
                const prompt = `당신은 ${selectedCharacter.description} 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자에게 "${task}"라는 할 일을 ${displayHours} 안에 해달라고 부탁하는 대사를 한마디 해주세요.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const dialogue = response.text().trim().replace(/^"|"$/g, '');
                
                await interaction.editReply({ content: '캐릭터가 응원을 보냈습니다.', components: [] });

                await webhook.send({
                    content: `<@${userId}>`,
                    username: selectedCharacter.label,
                    avatarURL: selectedCharacter.avatarURL,
                    embeds: [{ description: `"${dialogue}"` }]
                });

                const timer = setTimeout(async () => {
                    const currentTodo = todos.get(userId);
                    if (currentTodo && currentTodo.task === task) {
                        const confirmationButtons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder().setCustomId(`finish_yes_${userId}_${task}`).setLabel('네, 끝냈어요').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`finish_no_${userId}_${task}`).setLabel('아니오, 못했어요').setStyle(ButtonStyle.Danger),
                                new ButtonBuilder().setCustomId(`finish_direct_${userId}_${task}`).setLabel('직접 입력').setStyle(ButtonStyle.Secondary)
                            );
                        
                        const webhookForTimer = await getOrCreateWebhook(channel);
                        if(webhookForTimer) {
                            await webhookForTimer.send({
                                content: `<@${userId}>`,
                                username: currentTodo.character.label,
                                avatarURL: currentTodo.character.avatarURL,
                                embeds: [{ description: `**"${task}"** 할 일은 다 하셨나요?` }],
                                components: [confirmationButtons]
                            });
                        }
                    }
                }, parseInt(durationMs));

                todos.set(userId, {
                    task: task,
                    character: selectedCharacter,
                    timer: timer,
                    channelId: channel.id,
                });
            }
        }
        else if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();

            const [type, action, userId, ...taskParts] = interaction.customId.split('_');
            const task = taskParts.join('_');

            if (type === 'modal' && action === 'submit') {
                const userInput = interaction.fields.getTextInputValue('reasonInput');
                const todo = todos.get(userId);

                if (!todo || todo.task !== task) {
                    return interaction.editReply({ content: '이미 처리되었거나 만료된 할 일입니다.', embeds: [], components: [] });
                }

                const prompt = `당신은 ${todo.character.description}라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자가 "${todo.task}" 할 일의 결과에 대해 "${userInput}" 라고 직접 입력했습니다. 사용자의 답변에 대해 캐릭터에 맞게 한마디 응답해주세요.`;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                const dialogue = response.text().trim().replace(/^"|"$/g, '');
                
                await interaction.editReply({
                    content: '',
                    embeds: [{ description: `"${dialogue}"` }],
                    components: []
                });
                todos.delete(userId);
            }
        }
    } catch (error) {
        console.error('상호작용 처리 중 오류 발생:', error);
        try {
            if (interaction && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
            } else if (interaction) {
                await interaction.followUp({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
            }
        } catch (e) {
            console.error("오류 응답을 보내는 데에도 실패했습니다:", e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is alive!');
});

app.listen(port, () => {
  console.log(`Web server is listening on port ${port}.`);
});