// ==UserScript==
// @name        我只想好好观影
// @namespace   liuser.betterworld.love
// @match       https://movie.douban.com/subject/*
// @match       https://m.douban.com/movie/*
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @antifeature tracking
// @connect     *
// @run-at      document-end
// @require     https://cdn.staticfile.org/artplayer/4.6.2/artplayer.min.js
// @require     https://unpkg.com/hls.js@1.2.9/dist/hls.min.js
// @version     2.5
// @author      liuser, collaborated with ray
// @description 想看就看
// @license MIT
// ==/UserScript==




(function () {
    const _debug = 0;
    let art = {}; //播放器
    let seriesNum = 0;
    let sourceSelected = false;
    const { query: $, queryAll: $$, isMobile } = Artplayer.utils;
    const tip = (message) => alert(message);

    //获取豆瓣影片名称
    const videoName = isMobile ? $(".sub-title").innerText : document.title.slice(0, -5);

    // debug
    const log = (function () {
        if (_debug) return console.log.bind(console);
        return function () { };
    })();

    //将html转为element
    function htmlToElement(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    function addScript() {//添加统计脚本
        let statistic = document.createElement('script');
        statistic.setAttribute("src", "https://hm.baidu.com/hm.js?f02301d8266631b0285c3e325c9a574b")
        document.head.appendChild(statistic);
    }

    //搜索源
    const searchSource = [
        { "name": "非凡资源", "searchUrl": "http://cj.ffzyapi.com/api.php/provide/vod/" },
        { "name": "量子资源", "searchUrl": "https://cj.lziapi.com/api.php/provide/vod/" },
        { "name": "ikun资源", "searchUrl": "https://ikunzyapi.com/api.php/provide/vod/from/ikm3u8/at/json/" },
        { "name": "光速资源", "searchUrl": "https://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8/" },
        { "name": "高清资源", "searchUrl": "https://api.1080zyku.com/inc/apijson.php/" },
        { "name": "188资源", "searchUrl": "https://www.188zy.org/api.php/provide/vod/" },
        { "name": "红牛资源", "searchUrl": "https://www.hongniuzy2.com/api.php/provide/vod/from/hnm3u8/" },
        // { "name": "飞速资源", "searchUrl": "https://www.feisuzyapi.com/api.php/provide/vod/" },//经常作妖或者没有资源
        // {"name":"闪电资源","searchUrl":"https://sdzyapi.com/api.php/provide/vod/"},//不太好，格式经常有错
        // { "name": "卧龙资源", "searchUrl": "https://collect.wolongzyw.com/api.php/provide/vod/" }, 非常恶心的广告
        // {"name":"天空资源","searchUrl":"https://m3u8.tiankongapi.com/api.php/provide/vod/from/tkm3u8/"},//有防火墙，垃圾
        // { "name": "8090资源", "searchUrl": "https://api.yparse.com/api/json/m3u8/" },垃圾 可能有墙
        // { "name": "百度云资源", "searchUrl": "https://api.apibdzy.com/api.php/provide/vod/" },
        // { "name": "酷点资源", "searchUrl": "https://kudian10.com/api.php/provide/vod/" },
        // { "name": "淘片资源", "searchUrl": "https://taopianapi.com/home/cjapi/as/mc10/vod/json/" },
        // { "name": "ck资源", "searchUrl": "https://ckzy.me/api.php/provide/vod/" },
        // { "name": "快播资源", "searchUrl": "https://caiji.kczyapi.com/api.php/provide/vod/" },
        // { "name": "海外看资源", "searchUrl": "http://api.haiwaikan.com/v1/vod/" }, // 说是屏蔽了所有中国的IP，所以如果你有外国的ip可能比较好
        // { "name": "68资源", "searchUrl": "https://caiji.68zyapi.com/api.php/provide/vod/" },

        // https://caiji.kczyapi.com/api.php/provide/vod/
        // {"name":"鱼乐资源","searchUrl":"https://api.yulecj.com/api.php/provide/vod/"},//速度太慢
        // {"name":"无尽资源","searchUrl":"https://api.wujinapi.me/api.php/provide/vod/"},//资源少

    ];

    //处理搜索到的结果:从返回结果中找到对应片子
    function handleResponse(r) {
        if (!r || r.list.length == 0) {
            log("未搜索到结果");
            return 0
        }
        let video, found = false;
        for (let item of r.list) {
            log("正在对比剧集年份");
            let yearEqual = getVideoYear(item.vod_year);
            if (yearEqual === 0) return 0;
            if (yearEqual) {
                video = item;
                found = true;
                break
            }
        }
        if (found == false) {
            log("没有找到匹配剧集的影片，怎么回事哟！");
            return 0
        }

        let playList = video.vod_play_url.split("$$$").filter(str => str.includes("m3u8"));
        if (playList.length == 0) {
            log("没有m3u8资源, 无法测速, 无法播放");
            return 0
        }
        playList = playList[0].split("#");
        playList = playList.map(str => {
            let index = str.indexOf("$");
            return { "name": str.slice(0, index), "url": str.slice(index + 1) }
        });

        return playList
    }

    //到电影网站搜索电影
    const search = (url) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: encodeURI(`${url}?ac=detail&wd=${videoName}`),
            timeout: 3000,
            responseType: 'json',
            onload(r) {
                try {
                    resolve(handleResponse(r.response, videoName));
                } catch (e) {
                    log("垃圾资源，解析失败了，可能有防火墙");
                    log(e);
                    reject()
                }
            },
            onerror: reject,
            ontimeout: reject
        });
    });

    //播放按钮
    class PlayBtn {
        constructor() {
            const e = htmlToElement(`<button class="liu-btn play-btn">一键播放</button>`);
            $(isMobile ? ".sub-original-title" : "h1").appendChild(e);
            const render = async (item) => {
                const playList = await search(item.searchUrl);
                if (playList == 0) return;
                if (e.loading) {
                    e.loading = false;
                    new UI(playList);
                }

                //渲染资源列表
                const btn = new SourceButton({ name: item.name, playList }).element;
                if (!sourceSelected) {
                    btn.classList.add("selected")
                    sourceSelected = true
                }



                $(".sourceButtonList").appendChild(btn);

            };
            e.onclick = function () {
                e.loading = true;
                //tip("正在搜索");
                searchSource.forEach(render);
                setTimeout(() => {
                    if (e.loading == true) {
                        e.loading = false;
                        tip("未搜索到资源")
                    } else {
                        speedTest()
                    }
                }, 3500);
            };
        }
    }



    class UI {
        constructor(playList) {
            document.body.appendChild(htmlToElement(
                `<div class="liu-playContainer">
				<button class="liu-closePlayer liu-btn">X</button>

				<div class="playSpace" >
					<div class="artplayer-app"></div>
          <div class="series">
            <div class="seletor-title">选集</div>
            <div class="series-contianer"></div>
          </div>
				</div>
        <div class="sourceButtonList"></div>
				<div class="mannul">
          <div class="show-series" style="color:#a3a3a3"></div>
          <a class="love-support liu-btn" href="http://babelgo.cn:5230/m/1" target="_blank" style="color:#4aa150">☕请我喝一杯咖啡吧，要饿死啦~</a>
        </div>
			</div>`
            )).querySelector(".liu-closePlayer").onclick = function () {
                this.parentNode.remove();
                document.body.style.overflow = 'auto';
            };
            document.body.style.overflow = 'hidden';
            //第n集开始播放
            log(playList[seriesNum].url);
            initArt(playList[seriesNum].url);
            new SeriesContainer(playList);
        }
    }

    //初始化播放器
    function initArt(url) {
        art = new Artplayer({
            container: ".artplayer-app",
            url: url,
            pip: true,
            fullscreen: true,
            fullscreenWeb: true,
            screenshot: true,
            hotkey: true,
            airplay: true,
            playbackRate: true,
            controls: [{
                name: "resolution",
                html: "分辨率",
                position: "right"
            }],
            customType: {
                m3u8(video, url) {
                    // Attach the Hls instance to the Artplayer instance
                    if (art.hls) art.hls.destroy();
                    art.hls = new Hls();
                    art.hls.loadSource(url);
                    art.hls.attachMedia(video);
                    if (!video.src) {//兼容safari
                        video.src = url;
                    }
                },
            }
        });
        art.once('destroy', () => art.hls.destroy());
        art.on("video:loadedmetadata", () => {
            art.controls.resolution.innerText = art.video.videoHeight + "P";
        });
        log(art)
    }


    //影视源选择按钮
    class SourceButton {
        constructor(item) {
            this.element = htmlToElement(`<button class="source-selector liu-btn" >${item.name}</button>`);
            this.element.onclick = () => {
                $(".selected") ? $(".selected").classList.remove("selected") : null;
                this.element.classList.add("selected")
                switchUrl(item.playList[seriesNum].url);
                new SeriesContainer(item.playList);

            };
            this.element._playList = item.playList
            this.element._sourceName = item.name
        }
        //sources 是[{name:"..资源",playList:[{name:"第一集",url:""}]}]
    }

    //剧集选择器
    class SeriesButton {
        constructor(pNode, name, url, index) {
            let selector = htmlToElement(
                `<button class="series-selector liu-btn" style="color:#a3a3a3" >${name.slice(0, 4)}</button>`
            )
            pNode.appendChild(selector).onclick = () => {
                seriesNum = index;
                switchUrl(url);
                $(".playing") ? $(".playing").classList.remove("playing") : null;
                // $(".show-series").innerText = `正在播放第${index + 1}集`;
                selector.classList.add("playing")
                speedTest()
            };
        }
    }

    //剧集选择器的container
    class SeriesContainer {
        constructor(playList) {
            //const e = htmlToElement(`<div class="series-select-space" style="display:flex;flex-wrap:wrap;overflow:scroll;align-content: start;"></div>`);
            const e = $(".series-contianer")
            e.innerHTML = ""
            for (let [index, item] of playList.entries()) {
                new SeriesButton(e, item.name, item.url, index);
            }
            seriesNum == 0 ? $(".series-selector").classList.add("playing") : null;
        }
    }



    function switchUrl(url) {//兼容safari
        art.switchUrl(url)
        if (art.video.src != url) {
            art.video.src = url;
        }
    }

    //获取电影的年份
    function getVideoYear(outYear) {
        const e = $(isMobile ? ".sub-original-title" : ".year");
        if (!e) {
            log("获取年份失败，请检查！");
            return 0;
        }
        return e.innerText.includes(outYear);
    }


    //下载
    const get = (url) => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: encodeURI(url),
                timeout: 10000,
                onload: function (r) {
                    resolve(r.response)
                },
                onerror: function (e) {
                    resolve("html")
                },
                ontimeout: function (o) {
                    resolve("html")
                }
            })
        })
    }

    //下载m3u8的内容，返回片段列表
    async function downloadM3u8(url) {
        let domain = url.split("/")[0]
        let baseUrl = url.split("/")[2]
        let downLoadList = []
        log(`正在获取index.m3u8 ${url}`)
        let downloadContent = await get(url)

        if (downloadContent.includes("html")) {
            log(downloadContent)
            log(`下载失败，被反爬虫了`)
            return []
        }

        if (downloadContent.includes("index.m3u8")) { //如果是m3u8地址
            let lines = downloadContent.split("\n")
            for (let item of lines) {
                if (/^[#\s]/.test(item)) continue //跳过注释和空白行
                if (/^\//.test(item)) {
                    downLoadList = await downloadM3u8(domain + "//" + baseUrl + item)
                } else if (/^(http)/.test(item)) {
                    downLoadList = await downloadM3u8(item)
                } else {
                    downLoadList = await downloadM3u8(url.replace("index.m3u8", item))
                }
            }
        } else {//如果是ts地址
            let lines = downloadContent.split("\n")
            for (let item of lines) {
                if (/^[#\s]/.test(item)) continue//跳过注释和空白行
                if (/^(http)/.test(item)) {//如果是http直链
                    downLoadList.push(item)
                } else if (/^\//.test(item)) { //如果是绝对链接
                    downLoadList.push(domain + "//" + baseUrl + item)
                } else {
                    downLoadList.push(url.replace("index.m3u8", item))
                }
            }
        }
        // log(`测试列表为${downLoadList}`)
        return downLoadList

    }


    //对资源进行测速
    function speedTest() {
        // tip("脚本自动测试源的速度，随后请自行切换源进行尝试")
        let sourceButtons = $$(".source-selector")
        //log(sourceButtons)
        sourceButtons.forEach(async (e) => {
            let url = e._playList[seriesNum].url
            let tsList = await downloadM3u8(url)
            let downloadList = []
            for (let i = 0; i < 8; i++) {
                downloadList.push(tsList[Math.floor(Math.random() * tsList.length)])
            }

            let downloadSize = 0
            let startTime = Date.now();

            for (item of downloadList) {
                log("正在下载" + item)
                let r = await getBuffer(item)
                downloadSize += r.byteLength / 1024 / 1024
            }
            let endTime = Date.now();
            let duration = (endTime - startTime) / 1000
            let speed = downloadSize / duration ? downloadSize / duration : 0

            log(`速度为${speed}mb/s`)

            e.innerText = e._sourceName + " " + speed.toFixed(2) + "mb/s"
            let state = speed > 1 ? "fast" : "slow"
            e.classList.add(`speed-${state}`)

        })
    }


    //将GM_xmlhttpRequest改造为Promise
    function getBuffer(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                timeout: 3000,
                url: encodeURI(url),
                responseType: "arraybuffer",
                onload: function (r) {
                    resolve(r.response);
                },
                onerror: function (error) {
                    resolve({ "byteLength": 0 })
                },
                ontimeout: function (out) {
                    log("速度太慢了")
                    resolve({ "byteLength": 0 })
                }
            });
        });
    }

    //按钮样式
    GM_addStyle(
        `
.liu-btn{
  cursor:pointer;
  font-size:1rem;
  padding: 0.6rem 1.2rem;
  border: 1px solid transparent;
}

.play-btn {
  border-radius: 8px;
  cursor: pointer;
  font-weight: bolder;
  background-color:#e8f5e9;
}
.play-btn:hover {
  background-color:#c8e6c9;
}
.play-btn:active{
  background-color: #81c784;
}

.source-selector{
  background-color: #141414;
  color: #99a2aa;
  padding:0.2rem 0.5rem;
  margin:0.5rem 0.875rem;
  border-radius:4px;
}

.series-selector{
  background-color: #141414;
  border-radius:3px;
  color: #99a2aa;
  width:3.5rem;
  height:3.5rem;
  font-size:0.75rem;
  line-height:3.5rem;
  padding:0;
}

.playing{
  border:1px solid #4caf50;
}

.selected{
  border:1px solid #4caf50;
}


.liu-closePlayer{
  border-radius:3px;
  background-color: #141414;
	float:right;
  color: #99a2aa;
  width:2rem;
  height:2rem;
  line-height:2rem;
  padding:0;
  margin:0.5rem 1rem;
}
.liu-closePlayer:hover{
  background-color:#1f1f1f;
  color:white;
}

.love-support{
  background-color:#141414;
}
.love-support:hover{
  background-color:#1f1f1f;
}


`

    );


    //剧集选择器布局
    GM_addStyle(
        `
.series-contianer{
  display:grid;
  grid-template-columns: repeat(5,1fr);
  grid-column-gap:0.5rem;
  grid-row-gap:0.5rem;
  margin-top:1rem;
}
@media screen and (max-width: 1025px) {
.series-contianer{
  display:grid;
  grid-template-columns: repeat(7,1fr);
  grid-column-gap:0.5rem;
  grid-row-gap:0.5rem;
  margin-top:1rem;
}

}


`
    )


    //布局
    GM_addStyle(
        `
.TalionNav{
	z-index:10;
}
.speed-slow{
	color:#9e9e9e;
}
.speed-fast{
	color:#4aa150;
}



.mannul{
  margin:1rem;
  font-size:1rem;
}



.liu-playContainer{
	width:100%;
	height:100%;
	background-color:#1c2022;
	position:fixed;
	top:0;
	z-index:11;
}



.video-selector{
	display:flex;
	flex-wrap:wrap;
	margin-top:1rem;
}

.liu-selector:hover{
	color:#aed0ee;
	background-color:none;
}

.liu-selector{
	color:black;
	cursor:pointer;
	padding:3px;
	margin:5px;
	border-radius:2px;
}

.liu-rapidPlay{
	color: #007722;
}

.liu-light{
	background-color:#7bed9f;
}




.playSpace{
	display: grid;
	height:500px;
  margin:1rem;
	grid-template-columns: 2fr 1fr;
	grid-row-gap:0px;
	grid-column-gap:1rem;
  margin-top:2rem;
  clear: both;
}
.series-select-space::-webkit-scrollbar {display:none}
.series-select-space{
	height:500px;
}

.artplayer-app{

	height:500px;

}
@media screen and (max-width: 1025px) {
	.playSpace{
		display: grid;
		height:700px;
		grid-template-rows: 1fr 1fr;
		grid-template-columns:1fr;
		grid-row-gap:10px;
		grid-column-gap:0px;
	}
	.series-select-space{
		height:200px;
	}
	.artplayer-app{
		height:400px;
	}
}

.seletor-title{
  height:3rem;
  line-height:3rem;
  background-color: #141414;
  color:#fafafa;
  font-size:1.25rem;
  padding: 0 1rem;
}


`
    );
    new PlayBtn();
    addScript();
})();