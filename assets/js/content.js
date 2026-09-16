'use strict';
/* CROMA — тексты интерфейса и блока «Подход».
   Подписи карточек опыта и звуки миксера — в media/, рядом с файлами. */

window.CROMA_CONFIG = {
  // Адрес, на который форма готовит письмо. Пустой — кнопка отправки неактивна.
  contactEmail: '',

  // Фото, видео, звуки и подписи карточек лежат в папке media/ и собираются tools/build.py.

  approach: [
    {
      title: { en: 'Compose', ru: 'Композиция' },
      short: { en: 'Original music, modular synthesis', ru: 'Оригинальная музыка, модульный синтез' },
      detail: {
        en: 'We write original music for each project. The electronic parts are played on modular synthesizers, so every project gets a sound of its own.',
        ru: 'Пишем оригинальную музыку под каждый проект. Электронные партии играем на модульных синтезаторах, поэтому у проекта появляется собственное звучание.'
      }
    },
    {
      title: { en: 'Perform', ru: 'Исполнение' },
      short: { en: 'Invited acoustic musicians', ru: 'Приглашённые музыканты' },
      detail: {
        en: 'Live instruments are recorded with invited musicians: cello, piano, strings and whatever else the piece needs.',
        ru: 'Живые инструменты записываем с приглашёнными музыкантами: виолончель, фортепиано, струнные и всё, что нужно произведению.'
      }
    },
    {
      title: { en: 'Spatialise', ru: 'Пространство' },
      short: { en: 'Sound design, system engineering', ru: 'Саунд-дизайн, инженерия систем' },
      detail: {
        en: 'We plan how the sound will live in the room, from a stereo mix to multichannel systems with dozens of loudspeakers. The space is part of the composition from the first sketch.',
        ru: 'Продумываем, как звук будет жить в помещении: от стерео до многоканальных систем с десятками колонок. Пространство входит в композицию с первого эскиза.'
      }
    }
  ]
};

window.CROMA_TEXT = {
  en: {
    pageTitle: 'CROMA — sound collective',
    description: 'Original music, sound design and spatial systems at the intersection of electronic structure and acoustic warmth.',
    skip: 'Skip intro',
    brandSub: 'SOUND COLLECTIVE',
    brandLabel: 'CROMA. Back to the full panel',
    services: 'MUSIC<br>FILM<br>SPATIAL AUDIO',
    language: 'Language',
    navLabel: 'Sections',
    navTeam: 'TEAM', navApproach: 'APPROACH', navFragments: 'FRAGMENTS', navContact: 'CONTACT',
    timeNote: 'EXTEND<br>BEYOND<br>TIME',
    mobileDescription: 'Original music / sound design / spatial systems',
    intro: 'Original music, sound design <br>and spatial systems at the <br>intersection of electronic <br>structure and acoustic warmth.',
    practices: 'FILM<br>NARRATIVE<br>IMMERSIVE<br>INSTALLATIONS<br>BRANDS<br>ARTISTS',
    approach: 'APPROACH',
    approachNote: 'Music, performance and space are developed as one sound concept.',
    built: '<span>BUILT WITH</span><br>MODULAR SYNTHESIS<br>INVITED MUSICIANS<br>SPATIAL ENGINEERING',
    scenes: 'SCENES', rhythm: 'RHYTHM', noRhythm: 'NO RHYTHM IN THIS SCENE',
    modularSide: 'MODULAR', acousticSide: 'ACOUSTIC',
    electronic: 'ELECTRONIC<br>STRUCTURE', warmth: 'ACOUSTIC<br>WARMTH',
    modularVolume: 'Modular volume', acousticVolume: 'Acoustic volume',
    balance: 'Electronic to acoustic balance',
    play: 'PLAY', pause: 'PAUSE', playLabel: 'Play the mix', pauseLabel: 'Pause the mix',
    instruction: 'Choose a scene, press Play and move the balance.',
    playing: '{names} · move the balance',
    loading: 'Loading sound…',
    noAudio: 'This sound is not available yet.',
    audioError: 'Sound could not start in this browser.',
    selectScene: 'Scene: {name}',
    team: 'TEAM EXPERIENCE',
    previous: 'Previous', next: 'Next',
    aboutProject: 'ABOUT THE PROJECT',
    fullscreen: 'Full screen',
    watchFull: 'Full video on YouTube',
    teamEyebrow: 'SELECTED TEAM EXPERIENCE',
    approachEyebrow: 'APPROACH',
    selectedMix: 'SELECTED MIX',
    contact: 'CONTACT',
    collaborate: 'Let’s collaborate.',
    startEnquiry: 'Start a project enquiry',
    enquiryEyebrow: 'CROMA / PROJECT ENQUIRY',
    enquiryIntro: 'Tell us about the film, the space and the sound you have in mind.',
    name: 'Name', email: 'Email', brief: 'About the project',
    briefPlaceholder: 'Format, timing, venue, musical direction…',
    submit: 'Prepare email',
    submitNote: 'Your email app opens with the brief filled in. You decide when to send it.',
    mailSubject: 'CROMA / Project enquiry',
    close: 'Close',
    footer: 'LISTEN. EXPLORE. COLLABORATE.',
    signoff: 'CROMA<br>SOUND COLLECTIVE<br>© 2026',
    panelSelected: '{name} selected.'
  },
  ru: {
    pageTitle: 'CROMA — звуковой коллектив',
    description: 'Оригинальная музыка, саунд-дизайн и пространственные системы на стыке электронной структуры и акустического тепла.',
    skip: 'Пропустить',
    brandSub: 'ЗВУКОВОЙ КОЛЛЕКТИВ',
    brandLabel: 'CROMA. Вернуться ко всей панели',
    services: 'МУЗЫКА<br>КИНО<br>ПРОСТРАНСТВЕННЫЙ ЗВУК',
    language: 'Язык',
    navLabel: 'Разделы',
    navTeam: 'КОМАНДА', navApproach: 'ПОДХОД', navFragments: 'ФРАГМЕНТЫ', navContact: 'КОНТАКТ',
    timeNote: 'ЗА<br>ПРЕДЕЛЫ<br>ВРЕМЕНИ',
    mobileDescription: 'Оригинальная музыка / саунд-дизайн / пространственный звук',
    intro: 'Оригинальная музыка, саунд-<br>дизайн и пространственные <br>системы на стыке электронной <br>структуры и акустического тепла.',
    practices: 'КИНО<br>НАРРАТИВНЫЕ ФОРМАТЫ<br>ИММЕРСИВНЫЕ ПРОЕКТЫ<br>ИНСТАЛЛЯЦИИ<br>БРЕНДЫ<br>АРТИСТЫ',
    approach: 'ПОДХОД',
    approachNote: 'Музыку, исполнение и пространство разрабатываем как одну звуковую идею.',
    built: '<span>ИЗ ЧЕГО СОСТОИТ</span><br>МОДУЛЬНЫЙ СИНТЕЗ<br>ПРИГЛАШЁННЫЕ МУЗЫКАНТЫ<br>ИНЖЕНЕРИЯ ЗВУКА',
    scenes: 'СЦЕНЫ', rhythm: 'РИТМ', noRhythm: 'В ЭТОЙ СЦЕНЕ НЕТ РИТМА',
    modularSide: 'МОДУЛЬ', acousticSide: 'АКУСТИКА',
    electronic: 'ЭЛЕКТРОННАЯ<br>СТРУКТУРА', warmth: 'АКУСТИЧЕСКОЕ<br>ТЕПЛО',
    modularVolume: 'Громкость модульного поля', acousticVolume: 'Громкость акустического поля',
    balance: 'Баланс электроники и акустики',
    play: 'ИГРАТЬ', pause: 'ПАУЗА', playLabel: 'Включить микс', pauseLabel: 'Поставить микс на паузу',
    instruction: 'Выберите сцену, нажмите «Играть» и двигайте баланс.',
    playing: '{names} · двигайте баланс',
    loading: 'Загружаем звук…',
    noAudio: 'Этот звук пока недоступен.',
    audioError: 'Не удалось включить звук в этом браузере.',
    selectScene: 'Сцена: {name}',
    team: 'ОПЫТ КОМАНДЫ',
    previous: 'Назад', next: 'Вперёд',
    aboutProject: 'О ПРОЕКТЕ',
    fullscreen: 'На весь экран',
    watchFull: 'Полное видео на YouTube',
    teamEyebrow: 'ИЗБРАННЫЙ ОПЫТ КОМАНДЫ',
    approachEyebrow: 'ПОДХОД',
    selectedMix: 'ТЕКУЩИЙ МИКС',
    contact: 'КОНТАКТ',
    collaborate: 'Давайте работать вместе.',
    startEnquiry: 'Написать о проекте',
    enquiryEyebrow: 'CROMA / ЗАЯВКА НА ПРОЕКТ',
    enquiryIntro: 'Расскажите о фильме, пространстве и звуке, который вы себе представляете.',
    name: 'Имя', email: 'Email', brief: 'О проекте',
    briefPlaceholder: 'Формат, сроки, площадка, музыкальное направление…',
    submit: 'Подготовить письмо',
    submitNote: 'Откроется почтовое приложение с готовым письмом. Отправите его сами.',
    mailSubject: 'CROMA / Заявка на проект',
    close: 'Закрыть',
    footer: 'СЛУШАТЬ. ИССЛЕДОВАТЬ. СОТРУДНИЧАТЬ.',
    signoff: 'CROMA<br>ЗВУКОВОЙ КОЛЛЕКТИВ<br>© 2026',
    panelSelected: 'Раздел «{name}».'
  }
};
