// ==UserScript==
// @name        我只想好好观影
// @namespace   liuser.betterworld.love
// @match       https://movie.douban.com/subject/*
// @match       https://m.douban.com/movie/*
// @grant       GM_xmlhttpRequest
// @grant       GM_download
// @grant       unsafeWindow
// @connect     *
// @run-at      document-end
// @require     https://unpkg.com/artplayer/dist/artplayer.js
// @require     https://unpkg.com/hls.js@1.2.9/dist/hls.min.js
// @version     1.4
// @author      liuser
// @description 本脚本的目的是为了最小化观影的门槛。
// @license MIT
// ==/UserScript==

//finish for循环检测有资源的链接
//finish 开始搜索时先搜索所有资源的链接，选出返回最快的那个
//如果点击播放5秒内没反应就多点几下


(function () {

    let mode = "debug"
    //调试log
    let log_machine = (function (mode) {
        if (mode == "debug") {
            return function (log) {
                console.log(log)
            }
        } else {
            return function (log) {

            }
        }
    })(mode)

    var art = {} //播放器
    //样式
    let css = `
    .TalionNav{
    z-index:10;
    }
    .liu-playContainer{
    width:100%;
    height:100%;
    background-color:white;
    position:fixed;
    top:0;
    z-index:11;
  }
  .liu-closePlayer{
  float:right;
  margin-inline:10px;
  }
  .video-selector{
      display:flex;
      flex-wrap:wrap;
    width:100%;
    overflow:scroll;
    margin-top:10px;
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
  .liu-sourceButton{
    margin-inline:5px;
  }
  
  
  `

    //搜索源
    let testSearchSource = [
        // {"name":"闪电资源","searchUrl":"https://sdzyapi.com/api.php/provide/vod/"},//不太好，格式经常有错
        { "name": "卧龙资源", "searchUrl": "https://collect.wolongzyw.com/api.php/provide/vod/" },
        { "name": "ikun资源", "searchUrl": "https://ikunzyapi.com/api.php/provide/vod/from/ikm3u8/at/json/" },
        // {"name":"天空资源","searchUrl":"https://m3u8.tiankongapi.com/api.php/provide/vod/from/tkm3u8/"},//有防火墙，垃圾
        { "name": "非凡资源", "searchUrl": "http://cj.ffzyapi.com/api.php/provide/vod/" },
        // { "name": "飞速资源", "searchUrl": "https://www.feisuzyapi.com/api.php/provide/vod/" },//经常作妖或者没有资源
        { "name": "红牛资源", "searchUrl": "https://www.hongniuzy2.com/api.php/provide/vod/from/hnm3u8/" },
        { "name": "高清资源", "searchUrl": "https://api.1080zyku.com/inc/apijson.php/" },
        { "name": "光速资源", "searchUrl": "https://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8/" },
        // {"name":"鱼乐资源","searchUrl":"https://api.yulecj.com/api.php/provide/vod/"},//速度太慢
        // {"name":"无尽资源","searchUrl":"https://api.wujinapi.me/api.php/provide/vod/"},//资源少

    ]


    let device = "pc"
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        device = "mobile"
        log_machine(`识别到是手机`)
    }
    let containerClass = ".artplayer-app"//包装器的class
    let artplayerContainer = `
  <div class="liu-playContainer">
    <a class="liu-closePlayer">点击此处关闭播放</a>
    <div class="sourceButtonList"></div>
  
    <div class="artplayer-app" style="width:100%;height:500px;">
    </div>
  
  </div>`//player的contianer

    let videoName = ""
    let videosSelector = `<div class="video-selector"></div>` //剧集选择器的container
    let selector = `<a class="liu-selector" ></a>` //每集的点击按钮
    let playButton = `<a class="liu-rapidPlay">播放</a>`
    let SourceButtonTemplate = `<a class="liu-sourceButton"></a>` //资源选择器






    //创建其他资源的按钮
    async function createSourceButton(name) {
        let tip = htmlToElement(`<span class="liu-tip">正在测速...你先看着，如果此段文字时间过长，那就是出bug了，排最前面的速度最快</span>`)
        let playContainer = document.querySelector(".liu-playContainer")
        playContainer.insertBefore(tip, playContainer.childNodes[0])
        let sortedSource = await sortSource(testSearchSource)
        playContainer.firstChild.remove()
        for (let source of sortedSource) {
            let buttonElement = htmlToElement(SourceButtonTemplate)
            buttonElement.innerText = source.name
            let copy = { ...source }
            buttonElement.onclick = async () => {
                destroyPlayer()
                go(copy)
            }
            playContainer.insertBefore(buttonElement, playContainer.childNodes[0])
        }
    }
    //先创建一个列表，然后再测速
    async function createSourceListFirst(name) {
        //先获得可以搜到资源的列表
        let searchedSource = []
        for (let item of testSearchSource) {
            log_machine(`正在搜索${item.name}`)
            let playList = await search(item.searchUrl, videoName)
            if (playList == 0) continue;
            searchedSource.push({ ...item })
        }
        log_machine(searchedSource[0])
        //先渲染这个列表
        let sourceButtonList = document.querySelector(".sourceButtonList")
        for (let item of searchedSource) {
            let sourceButton = htmlToElement(SourceButtonTemplate)
            log_machine(`给这个按钮命名${item}`)
            sourceButton.innerText = item.name
            sourceButton.onclick = async () => {
                destroyPlayer()
                go({ ...item })
            }
            sourceButtonList.appendChild(sourceButton)

        }
        sourceButtonList.appendChild(htmlToElement(`<span class="liu-tip">...自动排序中，排最前面的速度最快</span>`))
        let sortedSource = await sortSource(searchedSource);
        // 重新渲染列表
        sourceButtonList.innerHTML = ""
        for (let item of sortedSource) {
            let buttonElement = htmlToElement(SourceButtonTemplate)
            buttonElement.innerText = item.name
            buttonElement.onclick = async () => {
                destroyPlayer()
                go({ ...item })
            }
            sourceButtonList.appendChild(buttonElement)
        }

    }





    //添加style样式
    function appendStyle(css) {
        let styleSheet = document.createElement("style")
        styleSheet.innerText = css
        document.head.appendChild(styleSheet)
    }



    //将html转为element
    function htmlToElement(html) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }
    //修改播放器url
    function changeUrl(url) {
        art.switchUrl(url)
    }

    //生成剧集
    function createVideoSelector(list) {

        let videosSelectorContainer = htmlToElement(videosSelector);
        let selectorContainer = htmlToElement(selector);
        list.forEach(item => {
            log_machine(`${item.name}:${item.url}`)
            let selectorContainerCopy = selectorContainer.cloneNode()
            selectorContainerCopy.innerText = item.name;
            selectorContainerCopy.onclick = () => {
                log_machine(`正在播放${item.name}:${item.url}`)
                changeUrl(item.url)
            }
            videosSelectorContainer.appendChild(selectorContainerCopy)

        })
        document.querySelector(".liu-playContainer").appendChild(videosSelectorContainer)
    }


    //生成播放器
    function createPlayer(url) {
        let container = htmlToElement(artplayerContainer);
        document.body.appendChild(container)
        //关闭播放器钩子
        let button = document.querySelector(".liu-closePlayer")
        log_machine(button)
        button.onclick = () => {
            destroyPlayer()
        }
        createPurePlayer(url)

    }


    //生成纯播放器
    function createPurePlayer(url) {
        //播放器
        art = new Artplayer({
            container: containerClass,
            url: url,
            setting: true,
            fullscreen: true,
            airplay: true,
            playbackRate: true,
            autoplay: true,
            customType: {
                m3u8: function (video, url) {
                    // Attach the Hls instance to the Artplayer instance
                    art.hls = new Hls();
                    art.hls.loadSource(url);
                    art.hls.attachMedia(video);
                    if (!video.src) {
                        video.src = url;
                    }
                },
            },
        });
    }

    //销毁播放器
    function destroyPlayer() {
        art.destroy();
        document.querySelector(".liu-playContainer").remove();
    }



    //获取豆瓣影片名称
    function getVideoName() {
        if (device == "mobile") {
            videoName = document.querySelector(".sub-title").innerText
            return videoName
        }
        if (window.getSelection().toString() != "") {
            videoName = window.getSelection().toString()
        }
        if (videoName == "") {
            videoName = document.querySelector("h1>span").innerText
        }
        return videoName
    }

    //到电影网站搜索电影
    function search(url, videoName) {
        log_machine(`正在搜索${videoName}`)
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: encodeURI(`${url}?ac=detail&wd=${videoName}`),
                onload: function (r) {
                    try {
                        // log_machine(`搜索结果为${JSON.stringify(r)}`)
                        let response = JSON.parse(r.responseText)
                        resolve(handleResponse(response, videoName));
                    } catch (e) {
                        log_machine("垃圾资源，解析失败了，可能有防火墙")
                        log_machine(e)
                        resolve({ "list": [] })
                    }

                },
                onerror: function (error) {
                    resolve({ "list": [] })
                }
            });
        });
    }

    //处理搜索到的结果:从返回结果中找到对应片子
    function handleResponse(r, searchName) {
        if (r.list.length == 0) {
            log_machine("未搜索到结果")
            return 0
        }
        let video = r.list[0];
        for (let item of r.list) {
            log_machine(`对比${item.vod_name}和${searchName}`)
            if (searchName == item.vod_name) {
                video = { ...item }
                break
            }
        }

        let videoName = video.vod_name;
        let playList = video.vod_play_url.split("$$$").filter(str => str.includes("m3u8"));
        if (playList.length == 0) {
            log_machine("没有m3u8资源，无法测速")
            return 0
        }
        playList = playList[0].split("#");
        playList = playList.map(str => {
            let index = str.indexOf("$");
            return { "name": str.slice(0, index), "url": str.slice(index + 1) }
        })

        return playList
    }

    //获取下载的内容
    function gm_download(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: encodeURI(url),
                onload: function (r) {
                    resolve(r.response)
                },
                onerror: function (e) {
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
        log_machine(`正在获取index.m3u8 ${url}`)
        let downloadContent = await gm_download(url)

        if (downloadContent.includes("html")) {
            log_machine(`下载失败，被反爬虫了`)
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
        log_machine(`测试列表为${downLoadList}`)
        return downLoadList

    }



    //测试下载速度
    async function testSpeed(list) {
        let downloadList = list.slice(0, 5)
        let downloadSize = 0
        let startTime = (new Date()).getTime();


        for (item of downloadList) {
            log_machine("正在下载" + item)
            let r = await makeGetRequest(item)
            downloadSize += r.loaded / 1024
        }

        let endTime = (new Date()).getTime();
        let duration = (endTime - startTime) / 1000
        let speed = downloadSize / duration

        log_machine(`速度为${speed}KB/s`)
        return speed
    }

    //将GM_xmlhttpRequest改造为Promise
    function makeGetRequest(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: encodeURI(url),
                responseType: "arraybuffer",
                onload: function (r) {
                    resolve(r);
                },
                onerror: function (error) {
                    resolve({ "loaded": 0 })
                }
            });
        });
    }

    //生成随机数
    function randomIntFromInterval(min, max) { // min and max included
        return Math.floor(Math.random() * (max - min + 1) + min)
    }

    //创建整个界面
    async function go(SearchSource) {
        // log_machine(`正在搜索${testSearchSource[2].name}`)
        log_machine(`正在搜索${SearchSource.name}`)
        let playList = await search(SearchSource.searchUrl, videoName)
        log_machine(`正在播放${playList[0].name}:${playList[0].url}`)
        createPlayer(playList[0].url)
        createVideoSelector(playList)
        await createSourceListFirst(videoName)
    }


    //测试代码
    // testSpeed(arr)
    // downloadM3u8("https://pps.sd-play.com/20220705/iS7EWI78/index.m3u8")
    // let div = document.createElement("div");
    async function main() {
        appendStyle(css) //添加css
        let rapidPlay = htmlToElement(playButton)
        rapidPlay.onclick = async () => {
            for (let item of testSearchSource) {
                let playList = await search(item.searchUrl, videoName)
                if (playList != 0) {
                    go(item)
                    return
                }
            }
            window.alert("没找到此资源，可能是因为豆瓣标题里夹杂了别的文字，可以选中部分文字后再次点击播放");
        }
        rapidPlay.onmouseover = () => {
            getVideoName()
        }
        if (device == "pc") {
            document.querySelector("h1").appendChild(rapidPlay)
        } else {
            document.querySelector(".sub-original-title").appendChild(rapidPlay)
        }


    }

    //将源根据速度进行排序
    async function sortSource() {
        log_machine("进入排序...")
        let sortedSource = []
        let videoName = getVideoName()
        for (let item of testSearchSource) {
            log_machine(`正在搜索${item.name}`)
            let playList = await search(item.searchUrl, videoName)
            if (playList == 0) continue;
            log_machine(`测速中...正在下载${item.name}`)
            let tsList = await downloadM3u8(playList[0].url)
            let speed = 0
            if (tsList.length == 0) {
                log_machine(`没有找到下载链接，请检查`)
            } else {
                speed = await testSpeed(tsList)
            }

            log_machine(`速度为${speed}`)
            sortedSource.push({ ...item, "speed": speed })
        }
        sortedSource.sort((a, b) => {
            return a.speed - b.speed;//从大到小排序
        })
        log_machine("排序完成...")
        for (let item of sortedSource) {
            log_machine(`${item.name}speed:${item.speed}`)
        }
        return sortedSource
    }




    main()


})()