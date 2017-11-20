const fetch = require('node-fetch');
const fs = require('fs');
const decompress = require('decompress');
const decompressBzip2 = require('decompress-bzip2');

const languages = ['cs'];

const createTempPath = (lang) => `./temp/${lang}.xml.bz2`;
const writeFile = function (path, buffer, permission) {
  permission = permission || 438; // 0666
  let fileDescriptor = null;

  try {
    fileDescriptor = fs.openSync(path, 'w', permission);
  } catch (e) {
    fs.chmodSync(path, permission);
    fileDescriptor = fs.openSync(path, 'w', permission);
  }

  if (fileDescriptor) {
    fs.writeSync(fileDescriptor, buffer, 0, buffer.length, 0);
    fs.closeSync(fileDescriptor);
  }
}

if (!fs.existsSync('temp')) {
  fs.mkdirSync('temp');
}

const languagesToDownload = languages.filter(lang => {
  try {
    fs.accessSync(createTempPath(lang))
  }
  catch (e) {
    return true;
  }
  return false;
});

const downloadDumps = () => {
  return Promise.all(
    languagesToDownload.map(lang => ({
      lang,
      url: `https://dumps.wikimedia.org/${lang}wiktionary/latest/${lang}wiktionary-latest-pages-articles.xml.bz2`,
    }))
      .map(dict =>
        new Promise(
          (resolve, reject) => {
            console.log(`Downloading ${dict.lang}...`)
            const dest = fs.createWriteStream(createTempPath(dict.lang));
            fetch(dict.url, { timeout: 0 })
              .then(res => {
                const stream = res.body.pipe(dest);
                stream.on('finish', () => resolve({ ...dict, res }));
              })
              .then(dict => {
                console.log('Done!');
                return dict;
              })
              .catch(e => { throw e; });
          }
        )
          .then(dict => {
            console.log('Done all!');
          })
      )
  )
}

const extractDumps = () => {
  return Promise.all(
    languages
      .map(lang => ({ lang, path: createTempPath(lang) }))
      .map(({ lang, path }) => {
        new Promise(
          (resolve, reject) => {
            console.log(`Extracting ${lang}...`)
            decompress(path, '.', {
              plugins: [
                decompressBzip2({ path: path.replace('.bz2', '') })
              ]
            })
              .then(files => {
                console.log('Done!');
              });
          }
        )
      })
  )
}


downloadDumps()
.then(() => {
  return extractDumps();
})
