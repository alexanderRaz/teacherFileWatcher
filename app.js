const { io } = require('socket.io-client');
const { statSync } = require('node:fs');
const { sep } = require('node:path');
const { readFile } = require('node:fs/promises');
const { watch } = require('chokidar');

const { serverAppWebSocketUrl, settingWatchFiles } = require('./config.json');

//Путь к папке, за файлами которой будем осуществлять наблюдение
const folder = process.argv[2];

if (!folder) return console.error('Not set path');
if (!statSync(folder).isDirectory()) return console.error('Not valid folder path');

//В URL подключения указывается namespace /teacher
const teacherSocket = io(serverAppWebSocketUrl);

/*Под именем проекта берётся имя папки, за файлами которой
будет происходить отслеживание изменений*/
const projectName = folder.split('\\').pop();

//Триггер надо ли при установке первого соединения отправлять команду на сброс истории
let flagClear = process.argv[3] == 'clearHistory';

teacherSocket.on('connect', () => {
  console.log('Connect to server side');

  if (flagClear) {
    flagClear = false;
    teacherSocket.emit('clearHistory');
  }
});

//Получении статистики о количестве пользователей, просматривающих изменения кода
teacherSocket.on('statUser', console.log);

//Получении уведомления о завершении очистки истории
teacherSocket.on('clearHistory', console.log);

//Получении уведомления о успешном создании вехи истории изменения файла
teacherSocket.on('successAddNewLog', (data) => {
  console.log(`File ${data.filename} success add to log. Version ${data.version}`);
});

teacherSocket.on('disconnect', () => {
  console.log('Disconnect server side');
});

/*Массив строк с частями путей изменяемых файлов, которые нужно исключить из
прослушивания изменений. Например: ["node_modules", "package-lock.json"] */
const excludeFilesWith = settingWatchFiles.excludeFilesWith;

/*Массив строк c расширениями файлов, за которыми нужно отслеживать изменения.
Например: [".js", ".json", ".css", ".html"] */
const includeFilesWithExt = settingWatchFiles.includeFilesWithExt;

//Функция для проверки, что файл подходит для наблюдения
function checkingForNotIgnoredFile(filename, stats) {
  if (stats) {
    if (!stats.isDirectory() && 
        !includeFilesWithExt.some((template) => filename.endsWith(template)))
      return true;
  } else {
    if (excludeFilesWith.some((template) => filename.includes(template))) return true;
  }

  return false;
}

//Чтение нового или изменённого файла и его отправка
async function readFileAndSend(filename) {
  try {
    const fileData = await readFile(filename, 'utf-8');

    let dataToServerSide = {
      filename: filename
        .replace(folder + sep, '')
        .split(sep)
        .join('|'),
      projectName, 
      fileData,
    };

    teacherSocket.emit('fileFromTeacher', dataToServerSide);
  } catch (err) {
    console.error(err);
  }
}

//Отправка информации о том, что файл удалён
function sendInfoAboutDeleteFile(filename) {
  let dataToServerSide = {
    filename: filename
      .replace(folder + sep, '')
      .split(sep)
      .join('|'),
    projectName,
    isRemoveFile: true,
  };

  teacherSocket.emit('fileFromTeacher', dataToServerSide);
}

const watcher = watch(folder, {
  interval: 1000,
  ignored: checkingForNotIgnoredFile,
  ignoreInitial: true,
});

watcher.on('add', readFileAndSend)
  .on('change', readFileAndSend)
  .on('unlink', sendInfoAboutDeleteFile);
