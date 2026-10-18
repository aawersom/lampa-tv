/*
 * Lampa: русские раздачи — owner's TV tweak (Lampa 3.x, internal torrent client).
 * Nothing is hidden: all parsers, all releases. Each release (row) is ranked on its own.
 * 1) The same torrent (same btih) found by both parsers becomes one row with all its trackers
 *    and the announce URLs of both magnets (one swarm: TorrServer asks every tracker for peers).
 * 2) Whatever sort is chosen in «Сортировать», on top of it:
 *      Russian releases first, then the rest,
 *      then releases whose year matches the film's year (wrong films with a similar title sink);
 *    inside each group the chosen sort stays (default «Популярное»: films by seeders,
 *    series latest season first). Russian = Russian audio in track info, or (no track info and
 *    on a Russian/Ukrainian tracker).
 * 3) A film without its own filter starts unfiltered (Lampa would reuse the last filter chosen for any film).
 * 4) Opening a card already asks the parsers; its «Торренты» list then opens with that answer (one kept, see below).
 * 5) The release last opened for that card is added to TorrServer while the card is open, so pressing it shows its
 *    files at once (see warmUp).
 * 6) The filter menu is built from the releases that bring something new to it — no 1-s freeze on a long list (see filterCover).
 * Patched: Parser.get callback (merge + rank) and the torrents component's sortWithViewed, which Lampa
 * calls after every sort (components/torrents.js sortResults). Already-opened releases stay pinned on top.
 */
(function () {
    'use strict';
    if (window.lampa_tv_ru_torrents) return;
    window.lampa_tv_ru_torrents = '1.9.0';

    var RANK = 'RuRank';
    var FOREIGN = ['piratebay', 'pirate bay', 'yts', 'knaben', '1337x', 'eztv', 'rarbg', 'torrentgalaxy', 'tgx',
        'nyaa', 'limetorrents', 'torlock', 'kickass', 'magnetdl', 'bitsearch', 'solidtorrents', 'glodls', 'zooqle',
        'btdig', 'torrentdownloads', 'idope', 'extratorrent', 'yourbittorrent', 'bt4g', 'therarbg'];

    function trackers(x) {
        return String(x.Tracker || '').toLowerCase().split(/\s*[,|;]\s*/).filter(Boolean);
    }

    function isForeign(name) {
        for (var i = 0; i < FOREIGN.length; i++) if (name.indexOf(FOREIGN[i]) >= 0) return true;
        return false;
    }

    function foreignOnly(x) {
        var t = trackers(x);
        if (!t.length) return false;
        for (var i = 0; i < t.length; i++) if (!isForeign(t[i])) return false;
        return true;
    }

    // 2 = track info shows Russian audio, 1 = unknown (no track info), 0 = track info says no Russian audio
    function ruAudio(x) {
        var p = x.ffprobe;
        if (!p || !p.length) return 1;
        var audio = p.filter(function (s) { return s && s.codec_type === 'audio'; });
        if (!audio.length) return 1;
        for (var i = 0; i < audio.length; i++) {
            var tags = audio[i].tags || {};
            var lang = String(tags.language || '').toLowerCase();
            var title = String(tags.title || '').toLowerCase();
            if (lang === 'rus' || lang === 'ru' || /рус|дубл|многоголос|одноголос|двухголос|russian/.test(title)) return 2;
        }
        return 0;
    }

    // 2 = title has the film's year, 1 = ±1 year or no year in title, 0 = other years only
    function yearRank(x, year, serial) {
        if (!year || serial) return 1;
        var ys = String(x.Title || '').match(/(?:19|20)\d\d/g);
        if (!ys) return 1;
        var best = 0;
        for (var i = 0; i < ys.length; i++) {
            var d = Math.abs(parseInt(ys[i], 10) - year);
            if (d === 0) return 2;
            if (d === 1) best = 1;
        }
        return best;
    }

    // Russian release = Russian audio known, or (audio unknown AND the release is on a Russian/Ukrainian tracker)
    function russian(x) {
        var a = ruAudio(x);
        if (a === 2) return 1;
        if (a === 0) return 0;
        return foreignOnly(x) ? 0 : 1;
    }

    function btih(x) {
        var m = /btih:([a-z0-9]+)/i.exec(String(x.MagnetUri || ''));
        return m ? m[1].toLowerCase() : '';
    }

    function announces(magnet) {
        return (String(magnet || '').match(/[?&]tr=[^&]*/g) || []).map(function (s) { return s.slice(1); });
    }

    // One torrent (same btih) reported by both parsers → one row: union of trackers, the larger
    // seeders/peers (both parsers count the same trackers, so summing would count them twice),
    // track info and «opened» mark from whichever copy has them. Different torrents never merge.
    function mergeSame(list) {
        var seen = {}, out = [];
        list.forEach(function (x) {
            var h = btih(x);
            if (!h) { out.push(x); return; }
            var base = seen[h];
            if (!base) { seen[h] = x; out.push(x); return; }
            var tr = trackers(base);
            trackers(x).forEach(function (t) { if (tr.indexOf(t) < 0) tr.push(t); });
            base.Tracker = tr.join(', ');
            // one swarm: TorrServer gets the announce URLs of both copies (more trackers → more peers found)
            var ann = announces(base.MagnetUri);
            announces(x.MagnetUri).forEach(function (a) {
                if (ann.indexOf(a) < 0) { ann.push(a); base.MagnetUri += '&' + a; }
            });
            base.Seeders = Math.max(parseInt(base.Seeders, 10) || 0, parseInt(x.Seeders, 10) || 0);
            base.Peers = Math.max(parseInt(base.Peers, 10) || 0, parseInt(x.Peers, 10) || 0);
            if ((!base.ffprobe || !base.ffprobe.length) && x.ffprobe && x.ffprobe.length) base.ffprobe = x.ffprobe;
            if (x.viewed) base.viewed = true;
        });
        return out;
    }

    function process(json, params) {
        if (!json || !json.Results || !json.Results.length) return;
        json.Results = mergeSame(json.Results);
        var movie = (params && params.movie) || {};
        var year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0, 4), 10) || 0;
        var serial = !!(movie.number_of_seasons || movie.original_name);
        json.Results.forEach(function (x) { x[RANK] = russian(x) * 3 + yearRank(x, year, serial); });
    }

    // 4) Prefetch. One answer is kept: the last opened card's, until it is used, the card is closed or 5 minutes pass
    //    (viewed marks inside it stay fresh). Opening another card replaces it.
    var PREFETCH_TTL = 5 * 60 * 1000;
    var prefetched = null;

    function searchKey(params) { return params && params.movie ? params.movie.id + '|' + params.search : ''; }

    function finish(p) { p.done = true; p.waiters.splice(0).forEach(function (f) { f(); }); }

    // the same search string the card's «Торренты» button builds (components/full start.js, setting parse_lang)
    function buttonSearch(card) {
        var year = ((card.first_air_date || card.release_date || '0000') + '').slice(0, 4);
        var t = card.title, o = card.original_title;
        return {
            df: o, df_year: o + ' ' + year, df_lg: o + ' ' + t, df_lg_year: o + ' ' + t + ' ' + year,
            lg: t, lg_year: t + ' ' + year, lg_df: t + ' ' + o, lg_df_year: t + ' ' + o + ' ' + year
        }[Lampa.Storage.field('parse_lang')];
    }

    // 5) Warm-up. Pressing a release makes Lampa add its magnet to TorrServer and ask for the file list every 2 s; for a
    //    magnet TorrServer first has to fetch the torrent's description from peers — Game of Thrones 1-8 (243 GB):
    //    8–11 s, the episode list came 12.2 s after the press (TV, 2026-10-18). The release opened before for this card
    //    (Lampa marks it: Storage torrents_view keeps Utils.hash(Title), results carry `viewed`) is added the same way as
    //    soon as the card's parser answer is in, and kept alive with a status request every 15 s (TorrServer drops a
    //    torrent nobody reads after 30 s) until the card closes, another release is pressed, the player starts or
    //    WARM_MAX passes. With «Сохранять в базу» on, TorrServer keeps the description and a warm-up takes 2–3 s.
    var WARM_MAX = 20 * 60 * 1000;
    var warm = null;

    function stopWarm() {
        if (warm) { clearInterval(warm.timer); warm = null; }
    }

    function warmUp(card, json) {
        stopWarm();
        var server = Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url();
        if (!server || !json || !json.Results) return;
        var view = Lampa.Storage.get('torrents_view', '[]') || [];
        var best = null, pos = -1;
        json.Results.forEach(function (r) {
            var i = r.viewed ? view.indexOf(r.hash) : -1;
            if (i > pos && (r.MagnetUri || r.Link)) { pos = i; best = r; }
        });
        if (!best) return;
        var net = new Lampa.Reguest(); // own request object: Lampa.Torserver's calls clear each other
        net.timeout(15000);
        var send = function (body, ok) { net.silent(server + '/torrents', ok || function () {}, function () {}, JSON.stringify(body)); };
        var w = warm = { id: card.id, title: best.Title, hash: '', started: Date.now() };
        // the body Lampa sends when the release is pressed (core Torserver.hash), so TorrServer keeps one and the same entry
        send({
            action: 'add', link: best.MagnetUri || best.Link, title: '[LAMPA] ' + (best.title || best.Title), poster: card.img || '',
            data: JSON.stringify({ lampa: true, movie: Lampa.Utils.clearCard ? Lampa.Utils.clearCard(card) : card }),
            save_to_db: Lampa.Storage.get('torrserver_savedb', 'false'), category: card.name ? 'tv' : 'movie'
        }, function (j) { if (j && j.hash) w.hash = j.hash; });
        w.timer = setInterval(function () {
            if (warm !== w || Date.now() - w.started > WARM_MAX) return stopWarm();
            if (w.hash) send({ action: 'get', hash: w.hash });
        }, 15000);
    }

    // 6) Filter menu without the freeze. Lampa builds it (components/torrents.js buildFilterd) by checking every release
    //    against each of its 911 voice names: Game of Thrones, 880 releases → 997 ms of frozen screen on the TV
    //    (2026-10-18), every time «Торренты» opens. The menu is only the union of voices / trackers / seasons in order of
    //    discovery, so Lampa gets just the releases that bring something new (the first one for each voice, tracker,
    //    season; ones without `info`, which that loop fills in): 880 → 36, same menu, ~220 ms.
    //    VOICES = Lampa 3.3.7's list (TitleParser voices). A voice Lampa adds later is still found through releases'
    //    `info.voices` (a name we don't know keeps its first release).
    var VOICES = ["Анастасия Гайдаржи + Андрей Юрченко","Студии Суверенного Лепрозория","Студия Пиратского Дубляжа","IgVin &amp; Solncekleshka","Gremlin Creative Studio","Alternative Production","HelloMickey Production","Bubble Dubbing Company","Н.Севастьянов seva1988","XDUB Dorama + Колобок","Мобильное телевидение","СПД - Сладкая парочка","Selena International","Black Street Records","Intra Communications","BBC Saint-Petersburg","Melodic Voice Studio","Voice Project Studio","Несмертельное оружие","Петербургский дубляж","Studio Victory Аsia","Asian Miracle Group","True Dubbing Studio","Lizard Cinema Trade","National Geographic","Позитив-Мультимедиа","Премьер Мультимедиа","Уолт Дисней Компани","Parovoz Production","Shadow Dub Project","Zone Vision Studio","Анастасия Гайдаржи","The Kitchen Russia","Малиновский Сергей","Family Fan Edition","Paramount Pictures","Иванова и П. Пашут","Так Треба Продакшн","Хихикающий доктор","Четыре в квадрате","Project Web Mania","Paramount Channel","Back Board Cinema","Zoomvision Studio","Universal Channel","RedDiamond Studio","НеЗупиняйПродакшн","Селена Интернешнл","Студия «Стартрек»","Колодій Трейлерів","Universal Russia","Paramount Comedy","Андрей Питерский","Реальный перевод","MC Entertainment","Екатеринбург Арт","Lucky Production","Cowabunga Studio","Анатолий Ашмарин","Васька Куролесов","Brain Production","Квадрат Малевича","Первый канал ОРТ","Русский Репортаж","Сolumbia Service","Sunshine Studio","GreenРай Studio","New Dream Media","DeadLine Studio","Воробьев Сергей","DeeAFilm Studio","Николай Дроздов","Денис Шадинский","Cartoon Network","Amazing Dubbing","Volume-6 Studio","Антонов Николай","Ульпаней Эльром","Cinema Prestige","AnimeSpace Team","CinemaSET GROUP","XvidClub Studio","З Ранку До Ночі","Максим Логинофф","Студия Горького","Ушастая озвучка","Hamster Studio","Agatha Studdio","SunshineStudio","Kulzvuk Studio","Вартан Дохалов","Viasat History","DIVA Universal","KosharaSerials","Julia Prosenuk","SovetRomantica","Mallorn Studio","TUMBLER Studio","CrazyCatStudio","Syfy Universal","Horizon Studio","Анатолий Гусев","Максим Жолобов","RedRussian1337","Creative Sound","Garsu Pasaulis","visanti-vasaer","GoodTime Media","Кирдин | Stalk","Anything-group","Goodtime Media","Jakob Bellmann","Витя «говорун»","Л. Володарский","Леша Прапорщик","Медиа-Комплекс","Прайд Продакшн","Русский дубляж","Союзмультфильм","Студия Колобок","Red Head Sound","LE-Production","ViruseProject","Victory-Films","Jetvis Studio","Greb&Creative","5-й канал СПб","Dream Records","Filiza Studio","SHIZA Project","Bars MacAdams","Nazel & Freya","Vulpes Vulpes","Храм Дорам ТВ","АРК-ТВ Studio","Film Prestige","Rainbow World","Banyan Studio","Bonsai Studio","Мадлен Дюваль","VO-Production","Voice Project","Flarrow Films","Видеопродакшн","Хоррор Мэйкер","Lizard Cinema","Фортуна-Фильм","VIP Serial HD","Старый Бильбо","Семыкина Юлия","Штамп Дмитрий","Arasi project","ARRU Workshop","Byako Records","FiliZa Studio","Gezell Studio","HamsterStudio","PCB Translate","Renegade Team","Sci-Fi Russia","The Mike Rec.","VO-production","Мика Бондарик","Наталья Гурзо","Премьер Видео","Трамвай-фильм","Кубик в Кубе","Кураж-Бамбей","Первый канал","Trdlo.studio","Студия Райдо","AniLibria.TV","RG.Paravozik","Profix Media","AlphaProject","AnimeReactor","Кармен Видео","Korean Craze","Sony Channel","Train Studio","Фильмэкспорт","Кирилл Сагач","ViP Premiere","Деваль Видео","RussianGuy27","HaseRiLLoPaW","Сергей Дидок","Mystery Film","Psychotronic","КонтентикOFF","Говинда Рага","Horror Maker","Альтера Парс","Видеоимпульс","Мьюзик-трейд","Тоникс Медиа","Элегия фильм","Oneinchnales","Кинопремьера","A. Lazarchuk","Animereactor","BadCatStudio","DreamRecords","General Film","Ivnet Cinema","RG Paravozik","sweet couple","VictoryFilms","VulpesVulpes","Wayland team","Гей Кино Гид","Нурмухаметов","Е. Хрусталёв","К. Поздняков","Н. Золотухин","Новый Дубляж","Р. Янкелевич","С. Кузьмичёв","С. Щегольков","Синема Трейд","Синта Рурони","Точка Zрения","КОМНАТА ДИДИ","FocusStudio","Gears Media","GladiolusTV","RecentFilms","NEON Studio","Володарский","Мастер Тэйп","XDUB Dorama","Sound-Group","Sony Sci-Fi","Good People","JWA Project","Nika Lenina","RiZZ_fisher","New Records","КураСгречей","Неоклассика","CrezaStudio","Видеосервис","BTI Studios","Eurochannel","Варус-Видео","HiWay Grope","Эй Би Видео","Nickelodeon","StudioFilms","Paul Bunyan","Inter Video","Franek Monk","Другое кино","Севастьянов","Lazer Video","Max Nabokov","Завгородний","SnowRecords","Crunchyroll","Gold Cinema","Прямостанов","Огородников","Кенс Матвей","1001 cinema","Cactus Team","Description","DVD Classic","Gala Voices","hungry_inri","Neoclassica","Oghra-Brown","Rebel Voice","Saint Sound","SakuraNight","TF-AniGroup","TrainStudio","Zone Studio","Zone Vision","Варус Видео","Г. Либергал","Г. Румянцев","Е. Гаевский","И. Сафронов","И. Степанов","Лазер Видео","Малиновский","Новый Канал","Петербуржец","С. Визгунов","С. Кузнецов","Студия Трёх","Цікава Ідея","Я. Беллманн","Studio Band","ApofysTeam","Карповский","LevshaFilm","1001cinema","CP Digital","Интерфильм","Комедия ТВ","Ох! Студия","SilverSnow","NewStation","StudioBand","Rain Death","Первый ТВЧ","HiWayGrope","Animegroup","Shachiburi","CactusTeam","Sony Turbo","AXN Sci-Fi","Т.О Друзей","West Video","East Dream","Sound Film","MaxMeister","VoicePower","CoralMedia","VSI Moscow","VGM Studio","Студия NLS","Хуан Рохас","TatamiFilm","диктор CDV","Pazl Voice","Саня Белый","Мост-Видео","AimaksaLTV","Contentica","Инфо-фильм","Электричка","Бусов Глеб","AvePremier","BraveSound","CinemaTone","DniproFilm","ELEKTRI4KA","eraserhead","Fox Russia","Mega-Anime","MifSnaiper","Nice-Media","PiratVoice","Postmodern","Reanimedia","Sky Voices","SkyeFilmTV","Костюкевич","Толстобров","Б. Федоров","Ващенко С.","Глуховский","Держиморда","Е. Гранкин","И. Еремеев","К. Филонов","Мост Видео","Н. Антонов","Н. Дроздов","Новый диск","Переводман","С. Казаков","С. Лебедев","С. Макашов","Союз Видео","ТВ XXI век","Ю. Немахов","Dream Cast","Причудики","NewStudio","Red Media","Синема УС","SDI Media","CasStudio","turok1990","HighHopes","AniLibria","FanStudio","Sedorelli","Flux-Team","Kobayashi","KinoGolos","Fox Crime","Discovery","GREEN TEA","Persona99","3df voice","ShinkaDan","АрхиТеатр","СВ-Студия","FilmsClub","fiendover","Воротилин","LakeFilms","Кириллица","AniPLague","JoyStudio","Формат AB","AveBrasil","Невафильм","OnisFilms","Neo-Sound","Муравский","BeniAffet","Янкелевич","AveDorama","Киномания","CBS Drama","Novamedia","NewComers","Ghostface","Sephiroth","Andre1288","DoubleRec","Astana TV","Останкино","Видеобаза","CLS Media","Seoul Bay","Хрусталев","Золотухин","Videogram","AAA-Sound","Epic Team","GoodVideo","Gramalant","INTERFILM","Kinomania","No-Future","RainDeath","RATTLEBOX","Sawyer888","SmallFilm","SOLDLUCK2","SpaceDust","Timecraft","Total DVD","Video-BIZ","VIZ Media","Васильцев","Григорьев","ААА-sound","Амальгама","Весельчак","Деньщиков","Шадинский","ЕА Синема","Зереницын","И. Клушин","Имидж-Арт","Карапетян","Машинский","Мительман","Рыжий пес","С. Дьяков","Самарский","СВ Студия","Советский","Солодухин","ТО Друзей","Ю. Сербин","Ю. Товбин","AnimeVost","Omskbird","LostFilm","AlexFilm","IdeaFilm","ColdFilm","KinoView","Jimmy J.","Дольский","Гаврилов","Алексеев","Визгунов","Либергал","Кузнецов","Горчаков","Gravi-TV","Murzilka","STEPonee","NovaFilm","Kerems13","Fox Life","AzOnFilm","SorzTeam","Гаевский","СВ-Дубль","GoldTeam","DexterTV","AniMedia","ANIvoice","JeFerSon","RealFake","AniMaunt","TurkStar","Медведев","FilmGate","Логинофф","Loginoff","Animedub","GostFilm","ClubFATE","Hallmark","Тимофеев","Дьяконов","Лексикон","Superbit","VideoBIZ","WestFilm","kubik&ko","Марченко","Журавлев","Карусель","Barin101","Amalgama","Кинолюкс","AB-Video","Пирамида","Нарышкин","Дубровин","Махонько","Хлопушка","АрхиАзия","Ultradox","Мельница","Бессонов","Бахурани","Индия ТВ","AdiSound","ALEKS KV","AuraFilm","DeadLine","Extrabit","Foxlight","GetSmart","ImageArt","Marclail","metalrus","Milirina","MiraiDub","MOYGOLOS","OMSKBIRD","Radamant","RoxMarty","st.Elrom","VashMax2","VendettA","XL Media","Артемьев","Васильев","Савченко","Воронцов","Войсовер","Домашний","Е. Лурье","Е. Рудой","Ист-Вест","ЛанселаП","Ленфильм","Заугаров","Мосфильм","Оверлорд","С. Рябов","Супербит","Толмачев","Ю. Живов","Paradox","BaibaKo","Jaskier","Колобок","Михалев","Дохалов","SoftBox","MUZOBOZ","ZM-Show","Levelin","Немахов","Яроцкий","BadBajo","СВ-Кадр","Позитив","RusFilm","Назаров","Сыендук","Яковлев","Lord32x","Onibaku","Trina_D","Hamster","AniFilm","HDrezka","ShowJet","BukeDub","SomeWax","Anifilm","TVShows","РуФилмс","Пифагор","AniStar","Netflix","Octopus","MixFilm","Рутилов","Elysium","FireDub","AveTurk","Багичев","Дасевич","Twister","Морозов","Sam2007","SesDizi","AnyFilm","Urasiko","Wakanim","Латышев","Ващенко","Сонотек","Никитин","Сонькин","Кипарис","Королёв","RUSCICO","Филонов","Ошурков","Герусов","Пятница","5 канал","Amalgam","Anistar","AniWayt","datynet","DeadSno","Eladiel","ELYSIUM","F-TRAIN","FoxLife","Janetta","Kолобок","LeDoyen","Liga HQ","lord666","Macross","McElroy","NemFilm","OpenDub","PashaUp","SOFTBOX","To4kaTV","TV 1000","VicTeam","ZM-SHOW","Клюквин","Матвеев","Смирнов","Бибиков","Абдулов","Данилов","sf@irat","Королев","Люсьена","Омикрон","Парадиз","Пепелац","Синхрон","Сокуров","Хихидок","AniBaza","Ozz.tv","Сербин","Кравец","SNK-TV","Amedia","Гоблин","Kiitos","Есарев","Санаев","Шварко","Карцев","Кашкин","Мудров","Иванов","Котова","Kansai","ZEE TV","AniDUB","Ancord","Berial","Cuba77","OSLIKt","Tycoon","Курдов","Кошкин","Stevie","Лагута","Кондор","Киреев","FocusX","Пронин","neko64","Shaman","GalVid","D.I.M.","Н-Кино","Товбин","binjak","Акцент","Козлов","Нева-1","Milvus","Готлиб","Zerzia","Дьяков","Вольга","Строев","Alezan","ДиоНиК","Стасюк","TV1000","NewDub","Набиев","Светла","Nastia","Emslie","100 ТВ","4u2ges","Azazel","BD CEE","Boльгa","den904","Elegia","Gemini","Jetvis","JimmyJ","KANSAI","kiitos","L0cDoG","LeXiKC","Lisitz","madrid","Mikail","MrRose","Ozz TV","Prolix","RedDog","Rumble","Satkur","Selena","Suzaku","WiaDUB","WVoice","Zendos","Агапов","Акопян","Шуваев","АБыГДе","Акалит","Альянс","Анубис","Anubis","Арк-ТВ","Бойков","Вихров","Векшин","Гризли","Гундос","Пучков","Живаго","Жучков","Зебуро","Килька","Лапшин","Лизард","Миняев","НЕВА 1","НЛО-TV","Ракурс","Россия","С.Р.И.","KOleso","Гуртом","ТВ СПб","Швецов","OnWave","DZUSKI","Kerob","To4ka","Чадов","Живов","ВГТРК","Elrom","Игмар","Котов","РенТВ","Рыбин","Ozeon","Cmert","Штейн","zamez","Гланц","Белов","Anika","Lupin","Ryc99","ko136","Рябов","Amber","Arisu","DeMon","Велес","Акира","Ворон","Рудой","С.Р.И","Лайко","D2Lab","Jetix","Попов","Хабар","Интер","AniUA","D2lab","erogg","IНТЕР","JetiX","PaDet","RinGo","seqw0","SHIZA","Solod","ssvss","Мишин","АнВад","Бигыч","Рукин","Штамп","Новий","Перец","Райдо","ТВЧ 1","Laci","ETV+","Vano","Jade","RAIM","Andy","Нота","Твин","ИДДК","Voiz","CPIG","Dice","Gits","ICTV","jept","KIHO","Line","SGEV","Tori","Troy","Twix","Чуев","Инис","Ирэн","ТВ-3","ТВИН","ДТВ","FOX","НТВ","СТС","ICG","ТВЦ","2x2","MTV","Oni","JAM","AMS","DDV","AMC","НСТ","IVI","КТК","Че!","MGM","МИР","ТНТ","FDV","ТВ3","LDV","1+1","2+2","2х2","AOS","CDV","MCA","QTV","TB5","VHS","АМС","ГКГ","ИГМ","НТН","РТР","ТВ6","ТРК","UKR","D1","R5","К9"];
    var VOICES_LOW = {};
    VOICES.forEach(function (v) { VOICES_LOW[v.toLowerCase()] = 1; });

    function filterCover(list) {
        var SEP = '\n', pick = [], titles = [], infos = [], tAt = [], iAt = [], tLen = 0, iLen = 0, seen = {};
        var first = function (key, i) { if (!seen[key]) { seen[key] = 1; pick[i] = true; } };
        list.forEach(function (e, i) {
            var names = e.info && e.info.voices ? e.info.voices.map(function (v) { return String(v).toLowerCase(); }) : [];
            var t = String(e.Title || '').toLowerCase() + SEP, v = SEP + (names.length ? names.join(SEP) + SEP : '');
            tAt.push(tLen); titles.push(t); tLen += t.length;
            iAt.push(iLen); infos.push(v); iLen += v.length;
            if (!e.info) pick[i] = true;
            String(e.Tracker || '').split(',').forEach(function (x) { first('t' + x.trim(), i); });
            ((e.general && e.general.seasons) || []).forEach(function (s) { first('s' + s, i); });
            names.forEach(function (n) { if (!VOICES_LOW[n]) first('v' + n, i); });
        });
        titles = titles.join(''); infos = infos.join('');
        var owner = function (at, pos) {
            var lo = 0, hi = at.length - 1;
            while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (at[mid] <= pos) lo = mid; else hi = mid - 1; }
            return lo;
        };
        VOICES.forEach(function (voice) {
            var low = voice.toLowerCase(), at = Infinity;
            var p = titles.indexOf(low); if (p >= 0) at = owner(tAt, p);
            var q = infos.indexOf(SEP + low + SEP); if (q >= 0) at = Math.min(at, owner(iAt, q));
            if (at !== Infinity) pick[at] = true;
        });
        return list.filter(function (e, i) { return pick[i]; });
    }

    function patch() {
        if (!window.Lampa || !Lampa.Parser || !Lampa.Parser.get || Lampa.Parser.get.__ruTorrents) return false;
        var orig = Lampa.Parser.get;

        // the torrents component keeps exactly this object as its `results`
        // non-enumerable: Lampa serialises the activity object into localStorage
        function attach(params, json) {
            if (params && typeof params === 'object') Object.defineProperty(params, '__ruJson', { value: json, writable: true, configurable: true, enumerable: false });
        }

        function run(params, oncomplite, onerror) {
            return orig.call(Lampa.Parser, params, function (json) {
                try { process(json, params); attach(params, json); } catch (e) { console.log('RuTorrents', 'process error', e && e.message); }
                oncomplite(json);
            }, onerror);
        }

        var wrapped = function (params, oncomplite, onerror) {
            var p = prefetched;
            if (p && !params.from_search && searchKey(params) === p.key && Date.now() - p.time < PREFETCH_TTL) {
                prefetched = null;
                var serve = function () {
                    if (!p.json) return run(params, oncomplite, onerror); // the prefetch failed — ask again
                    attach(params, p.json);
                    oncomplite(p.json);
                };
                if (p.done) setTimeout(serve, 0); else p.waiters.push(serve);
                return;
            }
            return run(params, oncomplite, onerror);
        };

        // the card opened → ask the parsers what its «Торренты» button will ask (components/full start.js)
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite' || !e.data || !e.data.movie || !Lampa.Storage.field('parser_use')) return;
            var card = e.data.movie;
            var params = { url: '', component: 'torrents', search: buttonSearch(card), search_one: card.title, search_two: card.original_title, movie: card, page: 1 };
            var p = prefetched = { key: searchKey(params), id: card.id, time: Date.now(), done: false, json: null, waiters: [] };
            run(params, function (json) {
                p.json = json;
                finish(p);
                try { warmUp(card, json); } catch (err) { console.log('RuTorrents', 'warm-up error', err && err.message); }
            }, function () { finish(p); });
        });

        // the card closed (back from it, not into its torrents) → drop its answer and its warm-up
        Lampa.Listener.follow('activity', function (e) {
            if (e.type !== 'destroy' || e.component !== 'full' || !e.object) return;
            if (prefetched && e.object.id == prefetched.id) prefetched = null;
            if (warm && e.object.id == warm.id) stopWarm();
        });
        // another release pressed → the warmed one is not needed; the player started → TorrServer has a reader now
        Lampa.Listener.follow('torrent', function (e) {
            if (e.type === 'onenter' && warm && e.element && e.element.Title !== warm.title) stopWarm();
        });
        if (Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.follow('start', stopWarm);
        wrapped.__ruTorrents = true;
        Lampa.Parser.get = wrapped;

        // Lampa ends every sort with sortWithViewed (already-opened releases pinned on top). After it:
        // keep the pin, then our rank, then the chosen sort's own order (index = stable tie-break).
        var Orig = Lampa.Component && Lampa.Component.get && Lampa.Component.get('torrents');
        if (Orig && !Orig.__ruTorrents) {
            var Comp = function (object) {
                Orig.call(this, object);
                // a film without its own filter starts unfiltered (Lampa falls back to the last filter used anywhere)
                this.getFilterData = function () {
                    var all = Lampa.Storage.get('torrents_filter_data', '{}') || {};
                    return all[this.cardID()] || {};
                };
                var buildFilterd = this.buildFilterd;
                if (typeof buildFilterd === 'function') this.buildFilterd = function () {
                    var r = object && object.__ruJson, all = r && r.Results;
                    if (!all) return buildFilterd.apply(this, arguments);
                    r.Results = filterCover(all);
                    try { return buildFilterd.apply(this, arguments); } finally { r.Results = all; }
                };
                var base = this.sortWithViewed;
                if (typeof base !== 'function') return;
                this.sortWithViewed = function () {
                    base.apply(this, arguments);
                    var r = object && object.__ruJson;
                    if (!r || !r.Results) return;
                    r.Results = r.Results.map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) {
                        return (y.a.viewed ? 1 : 0) - (x.a.viewed ? 1 : 0) || (y.a[RANK] || 0) - (x.a[RANK] || 0) || x.i - y.i;
                    }).map(function (x) { return x.a; });
                };
            };
            Comp.prototype = Orig.prototype;
            Comp.__ruTorrents = true;
            Lampa.Component.add('torrents', Comp);
        }

        // 1.0–1.3 used their own sort key, which Lampa's sort menu doesn't list → back to Lampa's default
        if (Lampa.Storage.get('torrents_sort', 'popular') === 'RuSeeders') Lampa.Storage.set('torrents_sort', 'popular');

        console.log('RuTorrents', 'ready', window.lampa_tv_ru_torrents);
        return true;
    }

    if (!patch()) {
        var tries = 0;
        var t = setInterval(function () { if (patch() || ++tries > 60) clearInterval(t); }, 500);
    }
})();
