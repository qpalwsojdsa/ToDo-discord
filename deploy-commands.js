const { REST, Routes } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

const commands = [
    {
        name: 'todo',
        description: '새로운 할 일을 등록합니다.',
        options: [
            {
                name: '할일',
                type: 3, // 3은 문자열(String)을 의미합니다.
                description: '수행할 작업 내용을 입력하세요.',
                required: true,
            },
        ],
    },
    {
        name: 'done',
        description: '진행 중인 할 일을 완료 처리합니다.',
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('(/) 슬래시 명령어를 등록하기 시작합니다.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('(/) 슬래시 명령어가 성공적으로 등록되었습니다.');
    } catch (error) {
        console.error(error);
    }
})();