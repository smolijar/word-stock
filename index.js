const fetch = require('node-fetch');
const fs = require('fs');
const decompress = require('decompress');
const decompressBzip2 = require('decompress-bzip2');
const xml2js = require('xml2js');
var wtf = require('wtf_wikipedia')
const _ = require('lodash')
const json2csv = require('json2csv');

const parser = new xml2js.Parser();
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

const folders = ['temp', 'out'];
folders.map(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }
})

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


const processResult = (result) => {
  const describeWord = (sections) => {
    const posOptions = [
      'podstatné jméno',
      'přídavné jméno',
      'zájmeno',
      'číslovka',
      'sloveso',
      'příslovce',
      'předložka',
      'spojka',
      'částice',
      'citoslovce',
    ]
    const pos = _.uniq(sections
      .filter(sec => posOptions.includes(sec.title))
      .map(sec => sec.title))
      .join(', ');
    const hyphenation = _.get(
      _.find(sections, { title: 'dělení' }),
      'sentences.0.text',
      ''
    ).replace('* ', '');
    const ethymology = _.get(
      _.find(sections, { title: 'etymologie' }),
      'sentences',
      []
    )
      .map(s => s.text)
      .join(' ');
    const meaning = _.get(
      _.find(sections, { title: 'význam' }),
      'lists.0',
      []
    )
      .map(s => s.text)
      .join(' ');
    return {
      pos,
      hyphenation,
      ethymology,
      meaning,
    }
  }
  const getText = (page) => page.revision[0].text[0]._;
  const pages = result.mediawiki.page;
  const page = pages[0];
  return pages
    .map(page => ({
      title: _.get(page, 'title.0'),
      text: getText(page),
      sections: wtf.parse(getText(page)).sections,
    }))
    .filter(page => page.title && page.text && page.sections && page.sections.length)
    .map(page => ({
      title: page.title,
      description: describeWord(page.sections, page.text),
    }))
    .filter(page => _.values(page.description).some(v => v != ''))
    .map(page => ({title: page.title, ...page.description}));
}

downloadDumps()
  .then(() => {
    return extractDumps();
  })
  .then(() => {
    languages.map(lang => {
      fs.readFile(`temp/${lang}.xml`, function (err, data) {
        parser.parseString(data, function (err, result) {
          const processed = processResult(result);
          fs.writeFile(`out/${lang}.json`, JSON.stringify(processed), function (err) {
            if (err) {
              return console.log(err);
            }
            console.log(`The file for ${lang} was saved!`);
          });
        });
      });
    })
  })
