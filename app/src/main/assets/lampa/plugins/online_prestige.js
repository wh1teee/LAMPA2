(function () {
    'use strict';

    function videocdn(component, _object) {
      let network = new Lampa.Reguest();
      let extract = {};
      let results = [];
      let object = _object;
      let get_links_wait = false;
      let filter_items = {};
      let choice = {
        season: 0,
        voice: 0,
        voice_name: ""
      };
      this.search = function(_object2, data) {
        object = _object2;
        get_links_wait = true;
        let url = component.proxy("videocdn") + "https://videocdn.tv/api/";
        let itm = data[0];
        if (!itm.iframe_src) return component.doesNotAnswer();
        let type = itm.iframe_src.split("/").slice(-2)[0];
        if (type == "movie") type = "movies";
        url += type;
        url = Lampa.Utils.addUrlComponent(url, "api_token=3i40G5TSECmLF77oAqnEgbx61ZWaOYaE");
        url = Lampa.Utils.addUrlComponent(url, "query=" + encodeURIComponent(itm.imdb_id ? itm.imdb_id : itm.title));
        url = Lampa.Utils.addUrlComponent(url, "field=" + encodeURIComponent(itm.imdb_id ? "imdb_id" : "title"));
        network.silent(url, (found) => {
          results = found.data.filter((elem) => elem.id == itm.id);
          if (!results.length) component.doesNotAnswer();
          else {
            try {
              success(results);
            } catch (e) {
              component.doesNotAnswer();
            }
          }
          component.loading(false);
        }, (a, c) => {
          component.doesNotAnswer();
        });
      };
      this.extendChoice = function(saved) {
        Lampa.Arrays.extend(choice, saved, true);
      };
      this.reset = function() {
        component.reset();
        choice = {
          season: 0,
          voice: 0,
          voice_name: ""
        };
        filter();
        append(filtred());
      };
      this.filter = function(type, a, b) {
        choice[a.stype] = b.index;
        if (a.stype == "voice") {
          choice.voice_name = filter_items.voice[b.index];
        }
        component.reset();
        filter();
        append(filtred());
      };
      this.destroy = function() {
        network.clear();
        results = null;
      };
      function success(json) {
        results = json;
        extractData(json);
        filter();
        append(filtred());
      }
      function extractItems(str, max_quality) {
        try {
          let items = str.split(",").map((item) => {
            return {
              quality: parseInt(item.match(/\[(\d+)p\]/)[1]),
              file: "http:" + item.replace(/\[\d+p\]/, "").split(" or ")[0]
            };
          }).filter((item) => {
            return item.quality <= max_quality;
          });
          items.sort((a, b) => {
            return b.quality - a.quality;
          });
          return items;
        } catch (e) {
        }
        return [];
      }
      function extractData(results2) {
        network.timeout(2e4);
        let movie = results2.slice(0, 1)[0];
        extract = {};
        if (movie) {
          let src = movie.iframe_src;
          let meta = $('head meta[name="referrer"]');
          let referrer = meta.attr("content") || "never";
          meta.attr("content", "unsafe-url");
          network.silent("https:" + src, (raw) => {
            var _a, _b, _c, _d;
            meta.attr("content", referrer);
            get_links_wait = false;
            component.render().find(".online-prestige__scan-file").remove();
            let math = raw.replace(/\n/g, "").match(/id="files" value="(.*?)"/);
            if (!math) math = raw.replace(/\n/g, "").match(/id="files" value='(.*?)'/);
            if (math) {
              let json = Lampa.Arrays.decodeJson(math[1].replace(/&quot;/g, '"'), {});
              var text = document.createElement("textarea");
              for (let i in json) {
                if (0 === i - 0) {
                  continue;
                }
                text.innerHTML = json[i];
                let max_quality = (_b = (_a = movie.media) == null ? void 0 : _a.filter((obj) => obj.translation_id === i - 0)[0]) == null ? void 0 : _b.max_quality;
                if (!max_quality) {
                  max_quality = (_d = (_c = movie.translations) == null ? void 0 : _c.filter((obj) => obj.id === i - 0)[0]) == null ? void 0 : _d.max_quality;
                }
                extract[i] = {
                  json: Lampa.Arrays.decodeJson(text.value, {}),
                  items: extractItems(json[i], max_quality)
                };
                for (let a in extract[i].json) {
                  let elem = extract[i].json[a];
                  if (elem.folder) {
                    for (let f in elem.folder) {
                      let folder = elem.folder[f];
                      folder.items = extractItems(folder.file, max_quality);
                    }
                  } else elem.items = extractItems(elem.file, max_quality);
                }
              }
            }
          }, () => {
            meta.attr("content", referrer);
            get_links_wait = false;
            component.render().find(".online-prestige__scan-file").remove();
          }, false, { dataType: "text" });
        }
      }
      function getFile(element) {
        let translat = extract[element.translation];
        let id = element.season + "_" + element.episode;
        let file = "";
        let items = [];
        let quality = false;
        if (translat) {
          if (element.season) {
            for (let i in translat.json) {
              let elem = translat.json[i];
              if (elem.folder) {
                for (let f in elem.folder) {
                  let folder = elem.folder[f];
                  if (folder.id == id) {
                    items = folder.items;
                    break;
                  }
                }
              } else if (elem.id == id) {
                items = elem.items;
                break;
              }
            }
          } else {
            items = translat.items;
          }
        }
        if (items && items.length) {
          quality = {};
          let mass = [720, 480, 360];
          if (Lampa.Account.hasPremium()) Lampa.Arrays.insert(mass, 0, 1080);
          mass.forEach((n) => {
            let exes = items.find((a) => a.quality == n);
            if (exes) {
              if (!file) file = exes.file;
              quality[n + "p"] = exes.file;
            }
          });
          let preferably = Lampa.Storage.get("video_quality_default", "1080") + "p";
          if (quality[preferably]) file = quality[preferably];
        }
        return {
          file,
          quality
        };
      }
      function filter() {
        filter_items = {
          season: [],
          voice: [],
          voice_info: []
        };
        results.slice(0, 1).forEach((movie) => {
          let seasons = movie.season_count || object.movie.number_of_seasons;
          if (seasons) {
            let s = seasons;
            while (s--) {
              filter_items.season.push(Lampa.Lang.translate("torrent_serial_season") + " " + (seasons - s));
            }
          }
          if (filter_items.season.length) {
            movie.episodes.forEach((episode) => {
              if (episode.season_num == choice.season + 1) {
                episode.media.forEach((media) => {
                  if (!filter_items.voice_info.find((v) => v.id == media.translation.id)) {
                    filter_items.voice.push(media.translation.shorter_title || media.translation.short_title);
                    filter_items.voice_info.push({
                      id: media.translation.id
                    });
                  }
                });
              }
            });
          }
        });
        if (choice.voice_name) {
          let inx = filter_items.voice.map((v) => v.toLowerCase()).indexOf(choice.voice_name.toLowerCase());
          if (inx == -1) choice.voice = 0;
          else if (inx !== choice.voice) {
            choice.voice = inx;
          }
        }
        component.filter(filter_items, choice);
      }
      function filtred() {
        let filtred2 = [];
        if (object.movie.name) {
          results.slice(0, 1).forEach((movie) => {
            movie.episodes.forEach((episode) => {
              if (episode.season_num == choice.season + 1) {
                let temp = episode.media.map((m) => m);
                let unique = [];
                temp.sort((a, b) => {
                  return b.max_quality - a.max_quality;
                });
                temp.forEach((m) => {
                  if (!unique.find((a) => a.translation.id == m.translation.id)) {
                    unique.push(m);
                  }
                });
                episode.media.forEach((media) => {
                  if (media.translation.id == filter_items.voice_info[choice.voice].id && unique.indexOf(media) !== -1) {
                    filtred2.push({
                      episode: parseInt(episode.num),
                      season: episode.season_num,
                      title: episode.ru_title,
                      quality: (media.source_quality && window.innerWidth > 480 ? media.source_quality.toUpperCase() + " - " : "") + media.max_quality + "p",
                      translation: media.translation_id,
                      info: filter_items.voice[choice.voice],
                      voice_name: filter_items.voice[choice.voice]
                    });
                  }
                });
              }
            });
          });
        } else {
          results.slice(0, 1).forEach((movie) => {
            movie.media.forEach((element) => {
              filtred2.push({
                title: element.translation.shorter_title || element.translation.short_title,
                quality: (element.source_quality && window.innerWidth > 480 ? element.source_quality.toUpperCase() + " - " : "") + element.max_quality + "p",
                translation: element.translation_id,
                voice_name: element.translation.shorter_title || element.translation.short_title
              });
            });
          });
        }
        return filtred2;
      }
      function toPlayElement(element) {
        let extra = getFile(element, element.quality);
        let play = {
          title: element.title,
          url: extra.file,
          quality: extra.quality,
          timeline: element.timeline,
          callback: element.mark
        };
        return play;
      }
      function append(items) {
        component.reset();
        component.draw(items, {
          onRender: (item, html) => {
            if (get_links_wait) html.find(".online-prestige__body").append($('<div class="online-prestige__scan-file"><div class="broadcast__scan"><div></div></div></div>'));
          },
          onEnter: (item, html) => {
            let extra = getFile(item, item.quality);
            if (extra.file) {
              let playlist = [];
              let first = toPlayElement(item);
              if (item.season) {
                items.forEach((elem) => {
                  playlist.push(toPlayElement(elem));
                });
              } else {
                playlist.push(first);
              }
              if (playlist.length > 1) first.playlist = playlist;
              Lampa.Player.play(first);
              Lampa.Player.playlist(playlist);
              item.mark();
            } else Lampa.Noty.show(Lampa.Lang.translate(get_links_wait ? "online_waitlink" : "online_nolink"));
          },
          onContextMenu: (item, html, data, call) => {
            call(getFile(item, item.quality));
          }
        });
      }
    }

    function rezka(component, _object) {
      let network = new Lampa.Reguest();
      let extract = {};
      let embed = component.proxy("rezka") + "https://voidboost.net/";
      let object = _object;
      let select_id = "";
      let filter_items = {};
      let choice = {
        season: 0,
        voice: 0,
        voice_name: ""
      };
      this.searchByKinopoisk = function(_object2, id) {
        object = _object2;
        select_id = id;
        getFirstTranlate(id, (voice) => {
          getFilm(id, voice);
        });
      };
      this.searchByImdbID = function(_object2, id) {
        object = _object2;
        select_id = id;
        getFirstTranlate(id, (voice) => {
          getFilm(id, voice);
        });
      };
      this.extendChoice = function(saved) {
        Lampa.Arrays.extend(choice, saved, true);
      };
      this.reset = function() {
        component.reset();
        choice = {
          season: 0,
          voice: 0,
          voice_name: ""
        };
        component.loading(true);
        getFilm(select_id);
        component.saveChoice(choice);
      };
      this.filter = function(type, a, b) {
        choice[a.stype] = b.index;
        if (a.stype == "voice") choice.voice_name = filter_items.voice[b.index];
        component.reset();
        filter();
        component.loading(true);
        getFilm(select_id, extract.voice[choice.voice].token);
        component.saveChoice(choice);
        setTimeout(component.closeFilter, 10);
      };
      this.destroy = function() {
        network.clear();
        extract = null;
      };
      function getSeasons(voice, call) {
        let url = embed + "serial/" + voice + "/iframe?h=gidonline.io";
        network.clear();
        network.timeout(1e4);
        network.native(url, (str) => {
          extractData(str);
          call();
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      }
      function getFirstTranlate(id, call) {
        network.clear();
        network.timeout(1e4);
        network.native(embed + "embed/" + id + "?s=1", (str) => {
          extractData(str);
          if (extract.voice.length) call(extract.voice[0].token);
          else component.doesNotAnswer();
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      }
      function getEmbed(url) {
        network.clear();
        network.timeout(1e4);
        network.native(url, (str) => {
          component.loading(false);
          extractData(str);
          filter();
          append();
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      }
      function getFilm(id, voice) {
        network.clear();
        network.timeout(1e4);
        let url = embed;
        if (voice) {
          if (extract.season.length) {
            let ses = extract.season[Math.min(extract.season.length - 1, choice.season)].id;
            url += "serial/" + voice + "/iframe?s=" + ses + "&h=gidonline.io";
            return getSeasons(voice, () => {
              let check = extract.season.filter((s) => s.id == ses);
              if (!check.length) {
                choice.season = extract.season.length - 1;
                url = embed + "serial/" + voice + "/iframe?s=" + extract.season[Math.min(extract.season.length - 1, choice.season)].id + "&h=gidonline.io";
              }
              getEmbed(url);
            });
          } else {
            url += "movie/" + voice + "/iframe?h=gidonline.io";
            getEmbed(url);
          }
        } else {
          url += "embed/" + id;
          url += "?s=1";
          getEmbed(url);
        }
      }
      function filter() {
        filter_items = {
          season: extract.season.map((v) => v.name),
          voice: extract.season.length ? extract.voice.map((v) => v.name) : []
        };
        if (choice.voice_name) {
          let inx = filter_items.voice.map((v) => v.toLowerCase()).indexOf(choice.voice_name.toLowerCase());
          if (inx == -1) choice.voice = 0;
          else if (inx !== choice.voice) {
            choice.voice = inx;
          }
        }
        if (!extract.season[choice.season]) choice.season = 0;
        component.filter(filter_items, choice);
      }
      function parseSubtitles(str) {
        let subtitle = str.match("subtitle': '(.*?)'");
        if (subtitle) {
          let index = -1;
          return subtitle[1].split(",").map((sb) => {
            let sp = sb.split("]");
            index++;
            return {
              label: sp[0].slice(1),
              url: sp.pop(),
              index
            };
          });
        }
      }
      function getStream(element, call, error) {
        if (element.stream) return call(element.stream);
        let url = embed;
        if (element.season) {
          url += "serial/" + extract.voice[choice.voice].token + "/iframe?s=" + element.season + "&e=" + element.episode + "&h=gidonline.io";
        } else {
          url += "movie/" + element.voice.token + "/iframe?h=gidonline.io";
        }
        network.clear();
        network.timeout(3e3);
        network.native(url, (str) => {
          var videos = str.match("file': '(.*?)'");
          if (videos) {
            let video = decode(videos[1]), qused = "", first = "", mass = ["2160p", "1440p", "1080p Ultra", "1080p", "720p", "480p", "360p"];
            video = video.slice(1).split(/,\[/).map((s) => {
              return s.split("]")[0] + "]" + (s.indexOf(" or ") > -1 ? s.split(" or").pop().trim() : s.split("]").pop());
            }).join("[");
            element.qualitys = {};
            let preferably = Lampa.Storage.get("video_quality_default", "1080");
            mass.forEach((n) => {
              let link = video.match(new RegExp(n + "](.*?)mp4"));
              if (link) {
                if (!first) first = link[1] + "mp4";
                element.qualitys[n] = link[1] + "mp4";
                if (n.indexOf(preferably) >= 0) {
                  qused = link[1] + "mp4";
                  first = qused;
                }
              }
            });
            if (!first) element.qualitys = false;
            if (first) {
              element.stream = qused || first;
              element.subtitles = parseSubtitles(str);
              call(element.stream);
            } else error();
          } else error();
        }, error, false, {
          dataType: "text"
        });
      }
      function decode(data) {
        function product(iterables, repeat) {
          var argv = Array.prototype.slice.call(arguments), argc = argv.length;
          if (argc === 2 && !isNaN(argv[argc - 1])) {
            var copies = [];
            for (var i = 0; i < argv[argc - 1]; i++) {
              copies.push(argv[0].slice());
            }
            argv = copies;
          }
          return argv.reduce(function tl(accumulator, value) {
            var tmp = [];
            accumulator.forEach(function(a0) {
              value.forEach(function(a1) {
                tmp.push(a0.concat(a1));
              });
            });
            return tmp;
          }, [
            []
          ]);
        }
        function unite(arr2) {
          var final = [];
          arr2.forEach(function(e) {
            final.push(e.join(""));
          });
          return final;
        }
        var trashList = ["@", "#", "!", "^", "$"];
        var two = unite(product(trashList, 2));
        var tree = unite(product(trashList, 3));
        var trashCodesSet = two.concat(tree);
        var arr = data.replace("#h", "").split("//_//");
        var trashString = arr.join("");
        trashCodesSet.forEach(function(i) {
          trashString = trashString.replace(new RegExp(btoa(i), "g"), "");
        });
        var result = "";
        try {
          result = atob(trashString.substr(2));
        } catch (e) {
        }
        return result;
      }
      function extractData(str) {
        extract.voice = [];
        extract.season = [];
        extract.episode = [];
        str = str.replace(/\n/g, "");
        let voices = str.match('<select name="translator"[^>]+>(.*?)</select>');
        let sesons = str.match('<select name="season"[^>]+>(.*?)</select>');
        let episod = str.match('<select name="episode"[^>]+>(.*?)</select>');
        if (sesons) {
          let select = $("<select>" + sesons[1] + "</select>");
          $("option", select).each(function() {
            extract.season.push({
              id: $(this).attr("value"),
              name: $(this).text()
            });
          });
        }
        if (voices) {
          let select = $("<select>" + voices[1] + "</select>");
          $("option", select).each(function() {
            let token = $(this).attr("data-token");
            if (token) {
              extract.voice.push({
                token,
                name: $(this).text(),
                id: $(this).val()
              });
            }
          });
        }
        if (episod) {
          let select = $("<select>" + episod[1] + "</select>");
          $("option", select).each(function() {
            extract.episode.push({
              id: $(this).attr("value"),
              name: $(this).text()
            });
          });
        }
      }
      function append() {
        component.reset();
        let items = [];
        if (extract.season.length) {
          extract.episode.forEach((episode) => {
            items.push({
              title: episode.name,
              quality: "720p ~ 1080p",
              season: extract.season[Math.min(extract.season.length - 1, choice.season)].id,
              episode: parseInt(episode.id),
              info: extract.voice[choice.voice].name,
              voice: extract.voice[choice.voice],
              voice_name: extract.voice[choice.voice].name
            });
          });
        } else {
          extract.voice.forEach((voice) => {
            items.push({
              title: voice.name.length > 3 ? voice.name : object.movie.title,
              quality: "720p ~ 1080p",
              voice,
              info: "",
              voice_name: voice.name
            });
          });
        }
        component.draw(items, {
          onEnter: (item, html) => {
            getStream(item, (stream) => {
              let first = {
                url: stream,
                timeline: item.timeline,
                quality: item.qualitys,
                title: item.title,
                subtitles: item.subtitles
              };
              Lampa.Player.play(first);
              if (item.season) {
                let playlist = [];
                items.forEach((elem) => {
                  let cell = {
                    url: (call) => {
                      getStream(elem, (stream2) => {
                        cell.url = stream2;
                        cell.quality = elem.qualitys;
                        elem.mark();
                        call();
                      }, () => {
                        cell.url = "";
                        call();
                      });
                    },
                    timeline: elem.timeline,
                    title: elem.title,
                    subtitles: elem.subtitles
                  };
                  if (elem == item) cell.url = stream;
                  playlist.push(cell);
                });
                Lampa.Player.playlist(playlist);
              } else {
                Lampa.Player.playlist([first]);
              }
              item.mark();
            }, () => {
              Lampa.Noty.show(Lampa.Lang.translate("online_nolink"));
            });
          },
          onContextMenu: (item, html, data, call) => {
            getStream(item, (stream) => {
              call({ file: stream, quality: item.qualitys });
            });
          }
        });
      }
    }

    function kinobase(component, _object) {
      let network = new Lampa.Reguest();
      let extract = {};
      let embed = component.proxy("kinobase") + "https://kinobase.org/";
      let object = _object;
      let select_title = "";
      let select_id = "";
      let is_playlist = false;
      let translation = "";
      let quality_type = "";
      let filter_items = {};
      let wait_similars;
      let choice = {
        season: 0,
        voice: -1
      };
      this.search = function(_object2, sim) {
        if (wait_similars && sim) return getPage(sim[0].link);
      };
      this.searchByTitle = function(_object2, query) {
        object = _object2;
        select_title = query;
        let url = embed + "search?query=" + encodeURIComponent(cleanTitle(select_title));
        network.native(url, (str) => {
          str = str.replace(/\n/, "");
          let links = object.movie.number_of_seasons ? str.match(/<a href="\/serial\/(.*?)">(.*?)<\/a>/g) : str.match(/<a href="\/film\/(.*?)" class="link"[^>]+>(.*?)<\/a>/g);
          let relise = object.search_date || (object.movie.number_of_seasons ? object.movie.first_air_date : object.movie.release_date) || "0000";
          let need_year = parseInt((relise + "").slice(0, 4));
          let found_url = "";
          if (links) {
            let cards = [];
            links.filter((l) => {
              let link = $(l), titl = link.attr("title") || link.text() || "";
              let year = parseInt(titl.split("(").pop().slice(0, -1));
              if (year > need_year - 2 && year < need_year + 2) cards.push({
                year,
                title: titl.split(/\(\d{4}\)/)[0].trim(),
                link: link.attr("href")
              });
            });
            let card = cards.find((c) => c.year == need_year);
            if (!card) card = cards.find((c) => c.title == select_title);
            if (!card && cards.length == 1) card = cards[0];
            if (card) found_url = cards[0].link;
            if (found_url) getPage(found_url);
            else if (links.length) {
              wait_similars = true;
              let similars = [];
              links.forEach((l) => {
                let link = $(l), titl = link.attr("title") || link.text();
                similars.push({
                  title: titl,
                  link: link.attr("href"),
                  filmId: "similars"
                });
              });
              component.similars(similars);
              component.loading(false);
            } else component.doesNotAnswer();
          } else component.doesNotAnswer();
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      };
      this.extendChoice = function(saved) {
        Lampa.Arrays.extend(choice, saved, true);
      };
      this.reset = function() {
        component.reset();
        choice = {
          season: 0,
          voice: -1
        };
        filter();
        append(filtred());
      };
      this.filter = function(type, a, b) {
        choice[a.stype] = b.index;
        component.reset();
        filter();
        append(filtred());
      };
      this.destroy = function() {
        network.clear();
        extract = null;
      };
      function cleanTitle(str) {
        return str.replace(".", "").replace(":", "");
      }
      function parsePlaylist(str) {
        let pl = [];
        try {
          if (str.charAt(0) === "[") {
            str.substring(1).split(",[").forEach(function(item) {
              let label_end = item.indexOf("]");
              if (label_end >= 0) {
                let label = item.substring(0, label_end);
                if (item.charAt(label_end + 1) === "{") {
                  item.substring(label_end + 2).split(";{").forEach(function(voice_item) {
                    let voice_end = voice_item.indexOf("}");
                    if (voice_end >= 0) {
                      let voice = voice_item.substring(0, voice_end);
                      pl.push({
                        label,
                        voice,
                        links: voice_item.substring(voice_end + 1).split(" or ")
                      });
                    }
                  });
                } else {
                  pl.push({
                    label,
                    links: item.substring(label_end + 1).split(" or ")
                  });
                }
              }
              return null;
            });
          }
        } catch (e) {
        }
        return pl;
      }
      function filter() {
        filter_items = {
          season: [],
          voice: []
        };
        if (is_playlist) {
          extract.forEach(function(item, i) {
            if (item.playlist) {
              filter_items.season.push(item.comment);
              if (i == choice.season) {
                item.playlist.forEach(function(eps) {
                  if (eps.file) {
                    parsePlaylist(eps.file).forEach(function(el) {
                      if (el.voice && filter_items.voice.indexOf(el.voice) == -1) {
                        filter_items.voice.push(el.voice);
                      }
                    });
                  }
                });
              }
            } else if (item.file) {
              parsePlaylist(item.file).forEach(function(el) {
                if (el.voice && filter_items.voice.indexOf(el.voice) == -1) {
                  filter_items.voice.push(el.voice);
                }
              });
            }
          });
        }
        if (!filter_items.season[choice.season]) choice.season = 0;
        if (!filter_items.voice[choice.voice]) choice.voice = 0;
        component.filter(filter_items, choice);
      }
      function filtred() {
        let filtred2 = [];
        if (is_playlist) {
          let playlist = extract;
          let season = object.movie.number_of_seasons && 1;
          if (extract[choice.season] && extract[choice.season].playlist) {
            playlist = extract[choice.season].playlist;
            season = parseInt(extract[choice.season].comment);
            if (isNaN(season)) season = 1;
          }
          playlist.forEach(function(eps, episode) {
            let items = extractItems(eps.file, filter_items.voice[choice.voice]);
            if (items.length) {
              let alt_voice = eps.comment.match(/\d+ серия (.*)$/i);
              let info = items[0].voice || alt_voice && alt_voice[1].trim() || translation;
              if (info == eps.comment) info = "";
              filtred2.push({
                file: eps.file,
                title: eps.comment,
                quality: (quality_type && window.innerWidth > 480 ? quality_type + " - " : "") + items[0].quality + "p",
                season,
                episode: episode + 1,
                info,
                voice: items[0].voice,
                voice_name: info,
                subtitles: parseSubs(eps.subtitle || "")
              });
            }
          });
        } else {
          filtred2 = extract;
        }
        return filtred2;
      }
      function extractItems(str, voice) {
        try {
          let list = parsePlaylist(str);
          if (voice) {
            let tmp = list.filter(function(el) {
              return el.voice == voice;
            });
            if (tmp.length) {
              list = tmp;
            } else {
              list = list.filter(function(el) {
                return typeof el.voice == "undefined";
              });
            }
          }
          let items = list.map(function(item) {
            let quality = item.label.match(/(\d\d\d+)p/);
            return {
              label: item.label,
              voice: item.voice,
              quality: quality ? parseInt(quality[1]) : NaN,
              file: item.links[0]
            };
          });
          items.sort(function(a, b) {
            if (b.quality > a.quality) return 1;
            if (b.quality < a.quality) return -1;
            if (b.label > a.label) return 1;
            if (b.label < a.label) return -1;
            return 0;
          });
          return items;
        } catch (e) {
        }
        return [];
      }
      function parseSubs(vod) {
        let subtitles = [];
        vod.split(",").forEach((s) => {
          let nam = s.match("\\[(.*?)]");
          if (nam) {
            let url = s.replace(/\[.*?\]/, "").split(" or ")[0];
            if (url) {
              subtitles.push({
                label: nam[1],
                url
              });
            }
          }
        });
        return subtitles.length ? subtitles : false;
      }
      function extractData(str, page) {
        let quality_match = page.match(/<li><b>Качество:<\/b>([^<,]+)<\/li>/i);
        let translation_match = page.match(/<li><b>Перевод:<\/b>([^<,]+)<\/li>/i);
        quality_type = quality_match ? quality_match[1].trim() : "";
        translation = translation_match ? translation_match[1].trim() : "";
        let vod = str.split("|");
        if (vod[0] == "file") {
          let file = vod[1];
          let found = [];
          let subtiles = parseSubs(vod[2]);
          if (file) {
            let voices = {};
            parsePlaylist(file).forEach(function(item) {
              let prev = voices[item.voice || ""];
              let quality_str = item.label.match(/(\d\d\d+)p/);
              let quality = quality_str ? parseInt(quality_str[1]) : NaN;
              if (!prev || quality > prev.quality) {
                voices[item.voice || ""] = {
                  quality
                };
              }
            });
            for (let voice in voices) {
              let el = voices[voice];
              found.push({
                file,
                title: voice || translation || object.movie.title,
                quality: (quality_type && window.innerWidth > 480 ? quality_type + " - " : "") + el.quality + "p",
                info: "",
                voice,
                subtitles: subtiles,
                voice_name: voice || translation || ""
              });
            }
          }
          extract = found;
          is_playlist = false;
        } else if (vod[0] == "pl") {
          extract = Lampa.Arrays.decodeJson(vod[1], []);
          is_playlist = true;
        } else component.emptyForQuery(select_title);
      }
      function getPage(url) {
        network.clear();
        network.timeout(1e3 * 10);
        network.native(embed + url, (str) => {
          str = str.replace(/\n/g, "");
          let MOVIE_ID = str.match("var MOVIE_ID = ([^;]+);");
          let IDENTIFIER = str.match('var IDENTIFIER = "([^"]+)"');
          let PLAYER_CUID = str.match('var PLAYER_CUID = "([^"]+)"');
          if (MOVIE_ID && IDENTIFIER && PLAYER_CUID) {
            select_id = MOVIE_ID[1];
            let identifier = IDENTIFIER[1];
            let player_cuid = PLAYER_CUID[1];
            let data_url = "user_data";
            data_url = Lampa.Utils.addUrlComponent(data_url, "page=movie");
            data_url = Lampa.Utils.addUrlComponent(data_url, "movie_id=" + select_id);
            data_url = Lampa.Utils.addUrlComponent(data_url, "cuid=" + player_cuid);
            data_url = Lampa.Utils.addUrlComponent(data_url, "device=DESKTOP");
            data_url = Lampa.Utils.addUrlComponent(data_url, "_=" + Date.now());
            network.clear();
            network.timeout(1e3 * 10);
            network.native(embed + data_url, (user_data) => {
              if (typeof user_data.vod_hash == "string") {
                let file_url = "vod/" + select_id;
                file_url = Lampa.Utils.addUrlComponent(file_url, "identifier=" + identifier);
                file_url = Lampa.Utils.addUrlComponent(file_url, "player_type=new");
                file_url = Lampa.Utils.addUrlComponent(file_url, "file_type=mp4");
                file_url = Lampa.Utils.addUrlComponent(file_url, "st=" + user_data.vod_hash);
                file_url = Lampa.Utils.addUrlComponent(file_url, "e=" + user_data.vod_time);
                file_url = Lampa.Utils.addUrlComponent(file_url, "_=" + Date.now());
                network.clear();
                network.timeout(1e3 * 10);
                network.native(embed + file_url, (files) => {
                  component.loading(false);
                  extractData(files, str);
                  filter();
                  append(filtred());
                }, (a, c) => {
                  component.doesNotAnswer();
                }, false, {
                  dataType: "text"
                });
              } else component.doesNotAnswer(L);
            }, (a, c) => {
              component.doesNotAnswer();
            });
          } else component.doesNotAnswer();
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      }
      function getFile(element) {
        let quality = {}, first = "";
        let preferably = Lampa.Storage.get("video_quality_default", "1080");
        element.file.split(",").reverse().forEach((file) => {
          let q = file.match("\\[(\\d+)p");
          if (q) {
            quality[q[1] + "p"] = file.replace(/\[\d+p\]/, "").replace(/{([^}]+)}/, "").split(" or ")[0];
            if (!first || q[1] == preferably) first = quality[q[1] + "p"];
          }
        });
        element.stream = first;
        element.qualitys = quality;
        return {
          file: first,
          quality
        };
      }
      function toPlayElement(element) {
        getFile(element);
        let play = {
          url: element.stream,
          timeline: element.timeline,
          title: element.title,
          subtitles: element.subtitles,
          quality: element.qualitys,
          callback: element.mark
        };
        return play;
      }
      function append(items) {
        component.reset();
        component.draw(items, {
          similars: wait_similars,
          onEnter: (item, html) => {
            getFile(item);
            if (item.stream) {
              let playlist = [];
              let first = toPlayElement(item);
              if (item.season) {
                items.forEach((elem) => {
                  playlist.push(toPlayElement(elem));
                });
              } else {
                playlist.push(first);
              }
              if (playlist.length > 1) first.playlist = playlist;
              Lampa.Player.play(first);
              Lampa.Player.playlist(playlist);
              item.mark();
            } else Lampa.Noty.show(Lampa.Lang.translate("online_nolink"));
          },
          onContextMenu: (item, html, data, call) => {
            call(getFile(item));
          }
        });
      }
    }

    function collaps(component, _object) {
      let network = new Lampa.Reguest();
      let extract = {};
      let embed = component.proxy("collaps") + "https://api.delivembd.ws/embed/";
      let filter_items = {};
      let choice = {
        season: 0,
        voice: 0
      };
      this.searchByKinopoisk = function(_object2, id) {
        this.searchIn("kp", id);
      };
      this.searchByImdbID = function(_object2, id) {
        this.searchIn("imdb", id);
      };
      this.searchIn = function(where, id) {
        let url = embed + where + "/" + id;
        network.silent(url, (str2) => {
          if (str2) {
            parse(str2);
          } else component.doesNotAnswer();
          component.loading(false);
        }, (a, c) => {
          component.doesNotAnswer();
        }, false, {
          dataType: "text"
        });
      };
      this.extendChoice = function(saved) {
        Lampa.Arrays.extend(choice, saved, true);
      };
      this.reset = function() {
        component.reset();
        choice = {
          season: 0,
          voice: 0
        };
        filter();
        append(filtred());
        component.saveChoice(choice);
      };
      this.filter = function(type, a, b) {
        choice[a.stype] = b.index;
        component.reset();
        filter();
        append(filtred());
        component.saveChoice(choice);
      };
      this.destroy = function() {
        network.clear();
        extract = null;
      };
      function parse(str) {
        str = str.replace(/\n/g, "");
        let find = str.match("makePlayer\\({(.*?)}\\);");
        if (find) {
          let json;
          try {
            json = eval("({" + find[1] + "})");
          } catch (e) {
          }
          if (json) {
            extract = json;
            filter();
            append(filtred());
          } else component.doesNotAnswer();
        }
      }
      function filter() {
        filter_items = {
          season: [],
          voice: [],
          quality: []
        };
        if (extract.playlist) {
          if (extract.playlist.seasons) {
            extract.playlist.seasons.forEach((season) => {
              filter_items.season.push(Lampa.Lang.translate("torrent_serial_season") + " " + season.season);
            });
          }
        }
        filter_items.season.sort((a, b) => {
          let n_a = parseInt(a.replace(/\D/g, ""));
          let n_b = parseInt(b.replace(/\D/g, ""));
          if (n_a > n_b) return 1;
          else if (n_a < n_b) return -1;
          else return 0;
        });
        component.filter(filter_items, choice);
      }
      function filtred() {
        let filtred2 = [];
        if (extract.playlist) {
          extract.playlist.seasons.forEach((season, i) => {
            if (season.season - 1 == choice.season) {
              season.episodes.forEach((episode) => {
                filtred2.push({
                  file: episode.hls,
                  episode: parseInt(episode.episode),
                  season: season.season,
                  title: episode.title,
                  quality: "",
                  info: episode.audio.names.slice(0, 5).join(", "),
                  subtitles: episode.cc ? episode.cc.map((c) => {
                    return { label: c.name, url: c.url };
                  }) : false
                });
              });
            }
          });
        } else if (extract.source) {
          let resolution = Lampa.Arrays.getKeys(extract.qualityByWidth).pop();
          let max_quality = extract.qualityByWidth ? extract.qualityByWidth[resolution] || 0 : 0;
          filtred2.push({
            file: extract.source.hls,
            title: extract.title,
            quality: max_quality ? max_quality + "p" : "",
            info: extract.source.audio.names.slice(0, 4).join(", "),
            subtitles: extract.source.cc ? extract.source.cc.map((c) => {
              return { label: c.name, url: c.url };
            }) : false
          });
        }
        return filtred2;
      }
      function append(items) {
        component.reset();
        component.draw(items, {
          onEnter: (item, html) => {
            if (item.file) {
              let playlist = [];
              let first = {
                url: item.file,
                timeline: item.timeline,
                title: item.title,
                subtitles: item.subtitles
              };
              if (item.season) {
                items.forEach((elem) => {
                  playlist.push({
                    title: elem.title,
                    url: elem.file,
                    timeline: elem.timeline,
                    subtitles: elem.subtitles,
                    callback: () => {
                      elem.mark();
                    }
                  });
                });
              } else {
                playlist.push(first);
              }
              if (playlist.length > 1) first.playlist = playlist;
              Lampa.Player.play(first);
              Lampa.Player.playlist(playlist);
              item.mark();
            } else Lampa.Noty.show(Lampa.Lang.translate("online_nolink"));
          },
          onContextMenu: (item, html, data, call) => {
            call({ file: item.file });
          }
        });
      }
    }

    function filmix(component, _object) {
      let network = new Lampa.Reguest();
      let extract = {};
      let results = [];
      let object = _object;
      let embed = "http://filmixapp.cyou/api/v2/";
      let wait_similars;
      let filter_items = {};
      let choice = {
        season: 0,
        voice: 0,
        voice_name: ""
      };
      let token = Lampa.Storage.get("filmix_token", "");
      let dev_token = "user_dev_apk=2.0.1&user_dev_id=&user_dev_name=Xiaomi&user_dev_os=11&user_dev_token=" + token + "&user_dev_vendor=Xiaomi";
      this.search = function(_object2, sim) {
        if (wait_similars) this.find(sim[0].id);
      };
      this.searchByTitle = function(_object2, query) {
        object = _object2;
        let year = parseInt((object.movie.release_date || object.movie.first_air_date || "0000").slice(0, 4));
        let orig = object.movie.original_title || object.movie.original_name;
        let url = embed + "search";
        url = Lampa.Utils.addUrlComponent(url, "story=" + encodeURIComponent(query));
        url = Lampa.Utils.addUrlComponent(url, dev_token);
        network.clear();
        network.silent(url, (json) => {
          let cards = json.filter((c) => {
            c.year = parseInt(c.alt_name.split("-").pop());
            return c.year > year - 2 && c.year < year + 2;
          });
          let card = cards.find((c) => c.year == year);
          if (!card) {
            card = cards.find((c) => c.original_title == orig);
          }
          if (!card && cards.length == 1) card = cards[0];
          if (card) this.find(card.id);
          else if (json.length) {
            wait_similars = true;
            component.similars(json);
            component.loading(false);
          } else component.doesNotAnswer();
        }, (a, c) => {
          component.doesNotAnswer();
        });
      };
      this.find = function(filmix_id) {
        let url = embed;
        if (!window.filmix.is_max_qualitie && token) {
          window.filmix.is_max_qualitie = true;
          network.clear();
          network.timeout(1e4);
          network.silent(url + "user_profile?" + dev_token, function(found) {
            if (found && found.user_data) {
              if (found.user_data.is_pro) window.filmix.max_qualitie = 1080;
              if (found.user_data.is_pro_plus) window.filmix.max_qualitie = 2160;
            }
            end_search(filmix_id);
          });
        } else end_search(filmix_id);
        function end_search(filmix_id2) {
          network.clear();
          network.timeout(1e4);
          network.silent((window.filmix.is_max_qualitie ? url + "post/" + filmix_id2 : url + "post/" + filmix_id2) + "?" + dev_token, function(found) {
            if (found && Object.keys(found).length) {
              success(found);
              component.loading(false);
            } else component.doesNotAnswer();
          }, function(a, c) {
            component.doesNotAnswer();
          });
        }
      };
      this.extendChoice = function(saved) {
        Lampa.Arrays.extend(choice, saved, true);
      };
      this.reset = function() {
        component.reset();
        choice = {
          season: 0,
          voice: 0,
          voice_name: ""
        };
        extractData(results);
        filter();
        append(filtred());
      };
      this.filter = function(type, a, b) {
        choice[a.stype] = b.index;
        if (a.stype == "voice") choice.voice_name = filter_items.voice[b.index];
        component.reset();
        extractData(results);
        filter();
        append(filtred());
      };
      this.destroy = function() {
        network.clear();
        results = null;
      };
      function success(json) {
        results = json;
        extractData(json);
        filter();
        append(filtred());
      }
      function extractData(data) {
        extract = {};
        let pl_links = data.player_links;
        if (pl_links.playlist && Object.keys(pl_links.playlist).length > 0) {
          let seas_num = 0;
          for (let season in pl_links.playlist) {
            let episode = pl_links.playlist[season];
            ++seas_num;
            let transl_id = 0;
            for (let voice in episode) {
              let episode_voice = episode[voice];
              ++transl_id;
              let items = [];
              for (let ID in episode_voice) {
                let file_episod = episode_voice[ID];
                let quality_eps = file_episod.qualities.filter(function(qualitys) {
                  return Boolean(qualitys);
                });
                let max_quality = Math.max.apply(null, quality_eps);
                let stream_url = file_episod.link.replace("%s.mp4", max_quality + ".mp4");
                let s_e = stream_url.slice(0 - stream_url.length + stream_url.lastIndexOf("/"));
                let str_s_e = s_e.match(/s(\d+)e(\d+?)_\d+\.mp4/i);
                if (str_s_e) {
                  let seas_num2 = parseInt(str_s_e[1]);
                  let epis_num2 = parseInt(str_s_e[2]);
                  items.push({
                    id: seas_num2 + "_" + epis_num2,
                    comment: epis_num2 + " " + Lampa.Lang.translate("torrent_serial_episode") + " <i>" + ID + "</i>",
                    file: stream_url,
                    episode: epis_num2,
                    season: seas_num2,
                    quality: max_quality,
                    qualities: quality_eps,
                    translation: transl_id
                  });
                }
              }
              if (!extract[transl_id]) extract[transl_id] = {
                json: [],
                file: ""
              };
              extract[transl_id].json.push({
                id: seas_num,
                comment: seas_num + " " + Lampa.Lang.translate("torrent_serial_season"),
                folder: items,
                translation: transl_id
              });
            }
          }
        } else if (pl_links.movie && pl_links.movie.length > 0) {
          let transl_id = 0;
          for (let ID in pl_links.movie) {
            let file_episod = pl_links.movie[ID];
            ++transl_id;
            let quality_eps = file_episod.link.match(/.+\[(.+[\d]),?\].+/i);
            if (quality_eps) quality_eps = quality_eps[1].split(",").filter(function(quality_) {
              return Boolean(quality_);
            });
            let max_quality = Math.max.apply(null, quality_eps);
            let file_url = file_episod.link.replace(/\[(.+[\d]),?\]/i, max_quality);
            extract[transl_id] = {
              file: file_url,
              translation: file_episod.translation,
              quality: max_quality,
              qualities: quality_eps
            };
          }
        }
      }
      function getFile(element, max_quality) {
        let translat = extract[element.translation];
        let id = element.season + "_" + element.episode;
        let file = "";
        let quality = false;
        if (translat) {
          if (element.season)
            for (let i in translat.json) {
              let elem = translat.json[i];
              if (elem.folder)
                for (let f in elem.folder) {
                  let folder = elem.folder[f];
                  if (folder.id == id) {
                    file = folder.file;
                    break;
                  }
                }
              else {
                if (elem.id == id) {
                  file = elem.file;
                  break;
                }
              }
            }
          else file = translat.file;
        }
        max_quality = parseInt(max_quality);
        if (file) {
          let link = file.slice(0, file.lastIndexOf("_")) + "_";
          let orin = file.split("?");
          orin = orin.length > 1 ? "?" + orin.slice(1).join("?") : "";
          if (file.split("_").pop().replace(".mp4", "") !== max_quality) {
            file = link + max_quality + ".mp4" + orin;
          }
          quality = {};
          let mass = [2160, 1440, 1080, 720, 480, 360];
          mass = mass.slice(mass.indexOf(max_quality));
          mass.forEach(function(n) {
            quality[n + "p"] = link + n + ".mp4" + orin;
          });
          let preferably = Lampa.Storage.get("video_quality_default", "1080") + "p";
          if (quality[preferably]) file = quality[preferably];
        }
        return {
          file,
          quality
        };
      }
      function filter() {
        filter_items = {
          season: [],
          voice: [],
          voice_info: []
        };
        if (results.last_episode && results.last_episode.season) {
          let s = results.last_episode.season;
          while (s--) {
            filter_items.season.push(Lampa.Lang.translate("torrent_serial_season") + " " + (results.last_episode.season - s));
          }
        }
        for (let Id in results.player_links.playlist) {
          let season = results.player_links.playlist[Id];
          let d = 0;
          for (let voic in season) {
            ++d;
            if (filter_items.voice.indexOf(voic) == -1) {
              filter_items.voice.push(voic);
              filter_items.voice_info.push({
                id: d
              });
            }
          }
        }
        if (choice.voice_name) {
          let inx = filter_items.voice.map((v) => v.toLowerCase()).indexOf(choice.voice_name.toLowerCase());
          if (inx == -1) choice.voice = 0;
          else if (inx !== choice.voice) {
            choice.voice = inx;
          }
        }
        component.filter(filter_items, choice);
      }
      function filtred() {
        let filtred2 = [];
        if (Object.keys(results.player_links.playlist).length) {
          for (let transl in extract) {
            let element = extract[transl];
            for (let season_id in element.json) {
              let episode = element.json[season_id];
              if (episode.id == choice.season + 1) {
                episode.folder.forEach(function(media) {
                  if (media.translation == filter_items.voice_info[choice.voice].id) {
                    filtred2.push({
                      episode: parseInt(media.episode),
                      season: media.season,
                      title: Lampa.Lang.translate("torrent_serial_episode") + " " + media.episode + (media.title ? " - " + media.title : ""),
                      quality: media.quality + "p ",
                      translation: media.translation,
                      voice_name: filter_items.voice[choice.voice],
                      info: filter_items.voice[choice.voice]
                    });
                  }
                });
              }
            }
          }
        } else if (Object.keys(results.player_links.movie).length) {
          for (let transl_id in extract) {
            let element = extract[transl_id];
            filtred2.push({
              title: element.translation,
              quality: element.quality + "p ",
              qualitys: element.qualities,
              translation: transl_id,
              voice_name: element.translation
            });
          }
        }
        return filtred2;
      }
      function toPlayElement(element) {
        let extra = getFile(element, element.quality);
        let play = {
          title: element.title,
          url: extra.file,
          quality: extra.quality,
          timeline: element.timeline,
          callback: element.mark
        };
        return play;
      }
      function append(items) {
        component.reset();
        component.draw(items, {
          similars: wait_similars,
          onEnter: (item, html) => {
            let extra = getFile(item, item.quality);
            if (extra.file) {
              let playlist = [];
              let first = toPlayElement(item);
              if (item.season) {
                items.forEach((elem) => {
                  playlist.push(toPlayElement(elem));
                });
              } else {
                playlist.push(first);
              }
              if (playlist.length > 1) first.playlist = playlist;
              Lampa.Player.play(first);
              Lampa.Player.playlist(playlist);
              item.mark();
            } else Lampa.Noty.show(Lampa.Lang.translate("online_nolink"));
          },
          onContextMenu: (item, html, data, call) => {
            call(getFile(item, item.quality));
          }
        });
      }
    }

    function component(object) {
      let network = new Lampa.Reguest();
      let scroll = new Lampa.Scroll({ mask: true, over: true });
      let files = new Lampa.Explorer(object);
      let filter = new Lampa.Filter(object);
      let sources = {
        collaps,
        kinobase,
        rezka,
        videocdn,
        filmix
      };
      let last;
      let extended;
      let selected_id;
      let source;
      let balanser;
      let initialized;
      let balanser_timer;
      let images = [];
      let filter_sources = Lampa.Arrays.getKeys(sources);
      let filter_translate = {
        season: Lampa.Lang.translate("torrent_serial_season"),
        voice: Lampa.Lang.translate("torrent_parser_voice"),
        source: Lampa.Lang.translate("settings_rest_source")
      };
      this.initialize = function() {
        source = this.createSource();
        filter.onSearch = (value) => {
          Lampa.Activity.replace({
            search: value,
            clarification: true
          });
        };
        filter.onBack = () => {
          this.start();
        };
        filter.render().find(".selector").on("hover:enter", () => {
          clearInterval(balanser_timer);
        });
        filter.onSelect = (type, a, b) => {
          if (type == "filter") {
            if (a.reset) {
              if (extended) source.reset();
              else this.start();
            } else {
              source.filter(type, a, b);
            }
          } else if (type == "sort") {
            Lampa.Select.close();
            this.changeBalanser(a.source);
          }
        };
        if (filter.addButtonBack) filter.addButtonBack();
        filter.render().find(".filter--sort span").text(Lampa.Lang.translate("online_balanser"));
        files.appendFiles(scroll.render());
        files.appendHead(filter.render());
        scroll.body().addClass("torrent-list");
        scroll.minus(files.render().find(".explorer__files-head"));
        this.search();
      };
      this.changeBalanser = function(balanser_name) {
        let last_select_balanser = Lampa.Storage.cache("online_last_balanser", 3e3, {});
        last_select_balanser[object.movie.id] = balanser_name;
        Lampa.Storage.set("online_last_balanser", last_select_balanser);
        Lampa.Storage.set("online_balanser", balanser_name);
        let to = this.getChoice(balanser_name);
        let from = this.getChoice();
        if (from.voice_name) to.voice_name = from.voice_name;
        this.saveChoice(to, balanser_name);
        Lampa.Activity.replace();
      };
      this.createSource = function() {
        let last_select_balanser = Lampa.Storage.cache("online_last_balanser", 3e3, {});
        if (last_select_balanser[object.movie.id]) {
          balanser = last_select_balanser[object.movie.id];
          Lampa.Storage.set("online_last_balanser", last_select_balanser);
        } else {
          balanser = Lampa.Storage.get("online_balanser", "collaps");
        }
        if (!sources[balanser]) {
          balanser = "collaps";
        }
        return new sources[balanser](this, object);
      };
      this.proxy = function(name) {
        let prox = Lampa.Storage.get("online_proxy_all");
        let need = Lampa.Storage.get("online_proxy_" + name);
        if (need) prox = need;
        if (prox && prox.slice(-1) !== "/") {
          prox += "/";
        }
        return prox;
      };
      this.create = function() {
        return this.render();
      };
      this.search = function() {
        this.activity.loader(true);
        this.filter({
          source: filter_sources
        }, this.getChoice());
        this.find();
      };
      this.find = function() {
        let url = this.proxy("videocdn") + "https://videocdn.tv/api/short";
        let query = object.search;
        url = Lampa.Utils.addUrlComponent(url, "api_token=3i40G5TSECmLF77oAqnEgbx61ZWaOYaE");
        const display = (json) => {
          if (object.movie.imdb_id) {
            let imdb = json.data.filter((elem) => elem.imdb_id == object.movie.imdb_id);
            if (imdb.length) json.data = imdb;
          }
          if (json.data && json.data.length) {
            if (json.data.length == 1 || object.clarification) {
              this.extendChoice();
              let kinopoisk_id = json.data[0].kp_id || json.data[0].filmId || json.data[0].kinopoiskId;
              if (kinopoisk_id && source.searchByKinopoisk) {
                source.searchByKinopoisk(object, kinopoisk_id);
              } else if ((json.data[0].imdb_id || json.data[0].imdbId) && source.searchByImdbID) {
                source.searchByImdbID(object, json.data[0].imdb_id || json.data[0].imdbId);
              } else if (source.search) {
                source.search(object, json.data);
              } else {
                this.doesNotAnswer();
              }
            } else {
              this.similars(json.data);
              this.loading(false);
            }
          } else this.doesNotAnswer(query);
        };
        const pillow = (a, c) => {
          network.timeout(1e3 * 10);
          network.native("https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=" + encodeURIComponent(query), (json) => {
            json.data = json.films;
            display(json);
          }, (a2, c2) => {
            this.doesNotAnswer();
          }, false, {
            headers: {
              "X-API-KEY": "2d55adfd-019d-4567-bbf7-67d503f61b5a"
            }
          });
        };
        const letgo = (imdb_id) => {
          if (imdb_id && source.searchByImdbID) {
            this.extendChoice();
            source.searchByImdbID(object, imdb_id);
          } else if (imdb_id) {
            network.timeout(1e3 * 8);
            network.native("https://kinopoiskapiunofficial.tech/api/v2.2/films?imdbId=" + encodeURIComponent(imdb_id), (json) => {
              if (json && json.items && json.items.length) {
                json.data = json.items;
                display(json);
              } else pillow();
            }, pillow.bind(this), false, {
              headers: {
                "X-API-KEY": "2d55adfd-019d-4567-bbf7-67d503f61b5a"
              }
            });
          } else {
            pillow();
          }
        };
        let resolved_imdb = object.movie.imdb_id || object.movie.external_ids && object.movie.external_ids.imdb_id;
        if (source.searchByTitle) {
          this.extendChoice();
          source.searchByTitle(object, object.movie.title || object.movie.name);
        } else if (object.movie.kinopoisk_id && source.searchByKinopoisk) {
          this.extendChoice();
          source.searchByKinopoisk(object, object.movie.kinopoisk_id);
        } else if (resolved_imdb) {
          letgo(resolved_imdb);
        } else if (object.movie.source == "tmdb" || object.movie.source == "cub") {
          let tmdburl = (object.movie.name ? "tv" : "movie") + "/" + object.movie.id + "/external_ids?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru";
          let baseurl = Lampa.TMDB.api(tmdburl);
          network.timeout(1e3 * 10);
          network.native(baseurl, function(ttid) {
            letgo(ttid.imdb_id);
          }, (a, c) => {
            letgo();
          });
        } else {
          letgo();
        }
      };
      this.getChoice = function(for_balanser) {
        let data = Lampa.Storage.cache("online_choice_" + (for_balanser || balanser), 3e3, {});
        let save = data[selected_id || object.movie.id] || {};
        Lampa.Arrays.extend(save, {
          season: 0,
          voice: 0,
          voice_name: "",
          voice_id: 0,
          episodes_view: {},
          movie_view: ""
        });
        return save;
      };
      this.extendChoice = function() {
        extended = true;
        source.extendChoice(this.getChoice());
      };
      this.saveChoice = function(choice, for_balanser) {
        let data = Lampa.Storage.cache("online_choice_" + (for_balanser || balanser), 3e3, {});
        data[selected_id || object.movie.id] = choice;
        Lampa.Storage.set("online_choice_" + (for_balanser || balanser), data);
      };
      this.similars = function(json) {
        json.forEach((elem) => {
          let info = [];
          let year = ((elem.start_date || elem.year || "") + "").slice(0, 4);
          if (elem.rating && elem.rating !== "null" && elem.filmId) info.push(Lampa.Template.get("online_prestige_rate", { rate: elem.rating }, true));
          if (year) info.push(year);
          if (elem.countries && elem.countries.length) {
            info.push((elem.filmId ? elem.countries.map((c) => c.country) : elem.countries).join(", "));
          }
          if (elem.categories && elem.categories.length) {
            info.push(elem.categories.slice(0, 4).join(", "));
          }
          let name = elem.title || elem.ru_title || elem.en_title || elem.nameRu || elem.nameEn;
          let orig = elem.orig_title || elem.nameEn || "";
          elem.title = name + (orig && orig !== name ? " / " + orig : "");
          elem.time = elem.filmLength || "";
          elem.info = info.join('<span class="online-prestige-split">\u25CF</span>');
          let item = Lampa.Template.get("online_prestige_folder", elem);
          item.on("hover:enter", () => {
            this.activity.loader(true);
            this.reset();
            object.search_date = year;
            selected_id = elem.id;
            this.extendChoice();
            let kinopoisk_id = elem.kp_id || elem.filmId;
            if (kinopoisk_id && source.searchByKinopoisk) {
              source.searchByKinopoisk(object, kinopoisk_id);
            } else if (source.search) {
              source.search(object, [elem]);
            } else {
              this.doesNotAnswer();
            }
          }).on("hover:focus", (e) => {
            last = e.target;
            scroll.update($(e.target), true);
          });
          scroll.append(item);
        });
      };
      this.clearImages = function() {
        images.forEach((img) => {
          img.onerror = () => {
          };
          img.onload = () => {
          };
          img.src = "";
        });
        images = [];
      };
      this.reset = function() {
        last = false;
        clearInterval(balanser_timer);
        network.clear();
        this.clearImages();
        scroll.render().find(".empty").remove();
        scroll.clear();
      };
      this.loading = function(status) {
        if (status) this.activity.loader(true);
        else {
          this.activity.loader(false);
          this.activity.toggle();
        }
      };
      this.filter = function(filter_items, choice) {
        let select = [];
        let add = (type, title) => {
          let need = this.getChoice();
          let items = filter_items[type];
          let subitems = [];
          let value = need[type];
          items.forEach((name, i) => {
            subitems.push({
              title: name,
              selected: value == i,
              index: i
            });
          });
          select.push({
            title,
            subtitle: items[value],
            items: subitems,
            stype: type
          });
        };
        filter_items.source = filter_sources;
        select.push({
          title: Lampa.Lang.translate("torrent_parser_reset"),
          reset: true
        });
        this.saveChoice(choice);
        if (filter_items.voice && filter_items.voice.length) add("voice", Lampa.Lang.translate("torrent_parser_voice"));
        if (filter_items.season && filter_items.season.length) add("season", Lampa.Lang.translate("torrent_serial_season"));
        filter.set("filter", select);
        filter.set("sort", filter_sources.map((e) => {
          return { title: e, source: e, selected: e == balanser };
        }));
        this.selected(filter_items);
      };
      this.closeFilter = function() {
        if ($("body").hasClass("selectbox--open")) Lampa.Select.close();
      };
      this.selected = function(filter_items) {
        let need = this.getChoice(), select = [];
        for (let i in need) {
          if (filter_items[i] && filter_items[i].length) {
            if (i == "voice") {
              select.push(filter_translate[i] + ": " + filter_items[i][need[i]]);
            } else if (i !== "source") {
              if (filter_items.season.length >= 1) {
                select.push(filter_translate.season + ": " + filter_items[i][need[i]]);
              }
            }
          }
        }
        filter.chosen("filter", select);
        filter.chosen("sort", [balanser]);
      };
      this.getEpisodes = function(season, call) {
        let episodes = [];
        if (typeof object.movie.id == "number" && object.movie.name) {
          Lampa.Api.sources.tmdb.get("tv/" + object.movie.id + "/season/" + season, {}, function(data) {
            episodes = data.episodes || [];
            call(episodes);
          }, function() {
            call(episodes);
          });
        } else call(episodes);
      };
      this.append = function(item) {
        item.on("hover:focus", (e) => {
          last = e.target;
          scroll.update($(e.target), true);
        });
        scroll.append(item);
      };
      this.watched = function(set) {
        let file_id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
        let watched = Lampa.Storage.cache("online_watched_last", 5e3, {});
        if (set) {
          if (!watched[file_id]) watched[file_id] = {};
          Lampa.Arrays.extend(watched[file_id], set, true);
          Lampa.Storage.set("online_watched_last", watched);
          this.updateWatched();
        } else {
          return watched[file_id];
        }
      };
      this.updateWatched = function() {
        let watched = this.watched();
        let body = scroll.body().find(".online-prestige-watched .online-prestige-watched__body").empty();
        if (watched) {
          let line = [];
          if (watched.balanser_name) line.push(watched.balanser_name);
          if (watched.voice_name) line.push(watched.voice_name);
          if (watched.season) line.push(Lampa.Lang.translate("torrent_serial_season") + " " + watched.season);
          if (watched.episode) line.push(Lampa.Lang.translate("torrent_serial_episode") + " " + watched.episode);
          line.forEach((n) => {
            body.append("<span>" + n + "</span>");
          });
        } else body.append("<span>" + Lampa.Lang.translate("online_no_watch_history") + "</span>");
      };
      this.draw = function(items, params = {}) {
        if (!items.length) return this.empty();
        scroll.append(Lampa.Template.get("online_prestige_watched", {}));
        this.updateWatched();
        this.getEpisodes(items[0].season, (episodes) => {
          let viewed = Lampa.Storage.cache("online_view", 5e3, []);
          let serial = object.movie.name ? true : false;
          let choice = this.getChoice();
          let fully = window.innerWidth > 480;
          let scroll_to_element = false;
          let scroll_to_mark = false;
          items.forEach((element, index) => {
            let episode = serial && episodes.length && !params.similars ? episodes.find((e) => e.episode_number == element.episode) : false;
            let episode_num = element.episode || index + 1;
            let episode_last = choice.episodes_view[element.season];
            Lampa.Arrays.extend(element, {
              info: "",
              quality: "",
              time: Lampa.Utils.secondsToTime((episode ? episode.runtime : object.movie.runtime) * 60, true)
            });
            let hash_timeline = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.original_title].join("") : object.movie.original_title);
            let hash_behold = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.original_title, element.voice_name].join("") : object.movie.original_title + element.voice_name);
            let data = {
              hash_timeline,
              hash_behold
            };
            let info = [];
            if (element.season) {
              element.translate_episode_end = this.getLastEpisode(items);
              element.translate_voice = element.voice_name;
            }
            element.timeline = Lampa.Timeline.view(hash_timeline, Lampa.Timeline.link(object.movie, element.season, element.episode));
            if (episode) {
              element.title = episode.name;
              if (element.info.length < 30 && episode.vote_average) info.push(Lampa.Template.get("online_prestige_rate", { rate: parseFloat(episode.vote_average + "").toFixed(1) }, true));
              if (episode.air_date && fully) info.push(Lampa.Utils.parseTime(episode.air_date).full);
            } else if (object.movie.release_date && fully) {
              info.push(Lampa.Utils.parseTime(object.movie.release_date).full);
            }
            if (!serial && object.movie.tagline && element.info.length < 30) info.push(object.movie.tagline);
            if (element.info) info.push(element.info);
            if (info.length) element.info = info.map((i) => "<span>" + i + "</span>").join('<span class="online-prestige-split">\u25CF</span>');
            let html = Lampa.Template.get("online_prestige_full", element);
            let loader = html.find(".online-prestige__loader");
            let image = html.find(".online-prestige__img");
            if (!serial) {
              if (choice.movie_view == hash_behold) scroll_to_element = html;
            } else if (typeof episode_last !== "undefined" && episode_last == episode_num) {
              scroll_to_element = html;
            }
            if (serial && !episode) {
              image.append('<div class="online-prestige__episode-number">' + ("0" + (element.episode || index + 1)).slice(-2) + "</div>");
              loader.remove();
            } else {
              let img = html.find("img")[0];
              img.onerror = function() {
                img.src = "./img/img_broken.svg";
              };
              img.onload = function() {
                image.addClass("online-prestige__img--loaded");
                loader.remove();
                if (serial) image.append('<div class="online-prestige__episode-number">' + ("0" + (element.episode || index + 1)).slice(-2) + "</div>");
              };
              img.src = Lampa.Api.img(episode ? episode.still_path : object.movie.backdrop_path, "w300");
              images.push(img);
            }
            html.find(".online-prestige__timeline").append(Lampa.Timeline.render(element.timeline));
            if (viewed.indexOf(hash_behold) !== -1) {
              scroll_to_mark = html;
              html.find(".online-prestige__img").append('<div class="online-prestige__viewed">' + Lampa.Template.get("icon_viewed", {}, true) + "</div>");
            }
            element.mark = () => {
              viewed = Lampa.Storage.cache("online_view", 5e3, []);
              if (viewed.indexOf(hash_behold) == -1) {
                viewed.push(hash_behold);
                Lampa.Storage.set("online_view", viewed);
                if (html.find(".online-prestige__viewed").length == 0) {
                  html.find(".online-prestige__img").append('<div class="online-prestige__viewed">' + Lampa.Template.get("icon_viewed", {}, true) + "</div>");
                }
              }
              choice = this.getChoice();
              if (!serial) {
                choice.movie_view = hash_behold;
              } else {
                choice.episodes_view[element.season] = episode_num;
              }
              this.saveChoice(choice);
              this.watched({
                balanser,
                balanser_name: Lampa.Utils.capitalizeFirstLetter(balanser),
                voice_id: choice.voice_id,
                voice_name: choice.voice_name || element.voice_name,
                episode: element.episode,
                season: element.season
              });
            };
            element.unmark = () => {
              viewed = Lampa.Storage.cache("online_view", 5e3, []);
              if (viewed.indexOf(hash_behold) !== -1) {
                Lampa.Arrays.remove(viewed, hash_behold);
                Lampa.Storage.set("online_view", viewed);
                if (Lampa.Manifest.app_digital >= 177) Lampa.Storage.remove("online_view", hash_behold);
                html.find(".online-prestige__viewed").remove();
              }
            };
            element.timeclear = () => {
              element.timeline.percent = 0;
              element.timeline.time = 0;
              element.timeline.duration = 0;
              Lampa.Timeline.update(element.timeline);
            };
            html.on("hover:enter", () => {
              if (object.movie.id) Lampa.Favorite.add("history", object.movie, 100);
              if (params.onEnter) params.onEnter(element, html, data);
            }).on("hover:focus", (e) => {
              last = e.target;
              if (params.onFocus) params.onFocus(element, html, data);
              scroll.update($(e.target), true);
            });
            if (params.onRender) params.onRender(element, html, data);
            this.contextMenu({
              html,
              element,
              onFile: (call) => {
                if (params.onContextMenu) params.onContextMenu(element, html, data, call);
              },
              onClearAllMark: () => {
                items.forEach((elem) => {
                  elem.unmark();
                });
              },
              onClearAllTime: () => {
                items.forEach((elem) => {
                  elem.timeclear();
                });
              }
            });
            scroll.append(html);
          });
          if (serial && episodes.length > items.length && !params.similars) {
            let left = episodes.slice(items.length);
            left.forEach((episode) => {
              let info = [];
              if (episode.vote_average) info.push(Lampa.Template.get("online_prestige_rate", { rate: parseFloat(episode.vote_average + "").toFixed(1) }, true));
              if (episode.air_date) info.push(Lampa.Utils.parseTime(episode.air_date).full);
              let air = new Date((episode.air_date + "").replace(/-/g, "/"));
              let now = Date.now();
              let day = Math.round((air.getTime() - now) / (24 * 60 * 60 * 1e3));
              let txt = Lampa.Lang.translate("full_episode_days_left") + ": " + day;
              let html = Lampa.Template.get("online_prestige_full", {
                time: Lampa.Utils.secondsToTime((episode ? episode.runtime : object.movie.runtime) * 60, true),
                info: info.length ? info.map((i) => "<span>" + i + "</span>").join('<span class="online-prestige-split">\u25CF</span>') : "",
                title: episode.name,
                quality: day > 0 ? txt : ""
              });
              let loader = html.find(".online-prestige__loader");
              let image = html.find(".online-prestige__img");
              let season = items[0] ? items[0].season : 1;
              html.find(".online-prestige__timeline").append(Lampa.Timeline.render(Lampa.Timeline.view(Lampa.Utils.hash([season, episode.episode_number, object.movie.original_title].join("")), Lampa.Timeline.link(object.movie, season, episode.episode_number))));
              let img = html.find("img")[0];
              if (episode.still_path) {
                img.onerror = function() {
                  img.src = "./img/img_broken.svg";
                };
                img.onload = function() {
                  image.addClass("online-prestige__img--loaded");
                  loader.remove();
                  image.append('<div class="online-prestige__episode-number">' + ("0" + episode.episode_number).slice(-2) + "</div>");
                };
                img.src = Lampa.Api.img(episode.still_path, "w300");
                images.push(img);
              } else {
                loader.remove();
                image.append('<div class="online-prestige__episode-number">' + ("0" + episode.episode_number).slice(-2) + "</div>");
              }
              html.on("hover:focus", (e) => {
                last = e.target;
                scroll.update($(e.target), true);
              });
              scroll.append(html);
            });
          }
          if (scroll_to_element) {
            last = scroll_to_element[0];
          } else if (scroll_to_mark) {
            last = scroll_to_mark[0];
          }
          Lampa.Controller.enable("content");
        });
      };
      this.contextMenu = function(params) {
        params.html.on("hover:long", () => {
          function show(extra) {
            let enabled = Lampa.Controller.enabled().name;
            let menu = [];
            if (Lampa.Platform.is("webos")) {
              menu.push({
                title: Lampa.Lang.translate("player_lauch") + " - Webos",
                player: "webos"
              });
            }
            if (Lampa.Platform.is("android")) {
              menu.push({
                title: Lampa.Lang.translate("player_lauch") + " - Android",
                player: "android"
              });
            }
            menu.push({
              title: Lampa.Lang.translate("player_lauch") + " - Lampa",
              player: "lampa"
            });
            menu.push({
              title: Lampa.Lang.translate("online_video"),
              separator: true
            });
            menu.push({
              title: Lampa.Lang.translate("torrent_parser_label_title"),
              mark: true
            });
            menu.push({
              title: Lampa.Lang.translate("torrent_parser_label_cancel_title"),
              unmark: true
            });
            menu.push({
              title: Lampa.Lang.translate("time_reset"),
              timeclear: true
            });
            if (extra) {
              menu.push({
                title: Lampa.Lang.translate("copy_link"),
                copylink: true
              });
            }
            menu.push({
              title: Lampa.Lang.translate("more"),
              separator: true
            });
            if (Lampa.Account.logged() && params.element && typeof params.element.season !== "undefined" && params.element.translate_voice) {
              menu.push({
                title: Lampa.Lang.translate("online_voice_subscribe"),
                subscribe: true
              });
            }
            menu.push({
              title: Lampa.Lang.translate("online_clear_all_marks"),
              clearallmark: true
            });
            menu.push({
              title: Lampa.Lang.translate("online_clear_all_timecodes"),
              timeclearall: true
            });
            Lampa.Select.show({
              title: Lampa.Lang.translate("title_action"),
              items: menu,
              onBack: () => {
                Lampa.Controller.toggle(enabled);
              },
              onSelect: (a) => {
                if (a.mark) params.element.mark();
                if (a.unmark) params.element.unmark();
                if (a.timeclear) params.element.timeclear();
                if (a.clearallmark) params.onClearAllMark();
                if (a.timeclearall) params.onClearAllTime();
                Lampa.Controller.toggle(enabled);
                if (a.player) {
                  Lampa.Player.runas(a.player);
                  params.html.trigger("hover:enter");
                }
                if (a.copylink) {
                  if (extra.quality) {
                    let qual = [];
                    for (let i in extra.quality) {
                      qual.push({
                        title: i,
                        file: extra.quality[i]
                      });
                    }
                    Lampa.Select.show({
                      title: Lampa.Lang.translate("settings_server_links"),
                      items: qual,
                      onBack: () => {
                        Lampa.Controller.toggle(enabled);
                      },
                      onSelect: (b) => {
                        Lampa.Utils.copyTextToClipboard(b.file, () => {
                          Lampa.Noty.show(Lampa.Lang.translate("copy_secuses"));
                        }, () => {
                          Lampa.Noty.show(Lampa.Lang.translate("copy_error"));
                        });
                      }
                    });
                  } else {
                    Lampa.Utils.copyTextToClipboard(extra.file, () => {
                      Lampa.Noty.show(Lampa.Lang.translate("copy_secuses"));
                    }, () => {
                      Lampa.Noty.show(Lampa.Lang.translate("copy_error"));
                    });
                  }
                }
                if (a.subscribe) {
                  Lampa.Account.subscribeToTranslation({
                    card: object.movie,
                    season: params.element.season,
                    episode: params.element.translate_episode_end,
                    voice: params.element.translate_voice
                  }, () => {
                    Lampa.Noty.show(Lampa.Lang.translate("online_voice_success"));
                  }, () => {
                    Lampa.Noty.show(Lampa.Lang.translate("online_voice_error"));
                  });
                }
              }
            });
          }
          params.onFile(show);
        }).on("hover:focus", () => {
          if (Lampa.Helper) Lampa.Helper.show("online_file", Lampa.Lang.translate("helper_online_file"), params.html);
        });
      };
      this.empty = function(msg) {
        let html = Lampa.Template.get("online_does_not_answer", {});
        html.find(".online-empty__buttons").remove();
        html.find(".online-empty__title").text(Lampa.Lang.translate("empty_title_two"));
        html.find(".online-empty__time").text(Lampa.Lang.translate("empty_text"));
        scroll.append(html);
        this.loading(false);
      };
      let tried_balansers = {};
      this.doesNotAnswer = function() {
        this.reset();
        tried_balansers[balanser] = true;
        let fast_chain = ["collaps", "kinobase", "rezka"];
        let next_fast = fast_chain.find((b) => !tried_balansers[b] && sources[b]);
        if (next_fast) {
          balanser = next_fast;
          if (source && source.destroy) source.destroy();
          source = new sources[balanser](this, object);
          this.search();
          return;
        }
        let html = Lampa.Template.get("online_does_not_answer", { balanser });
        let tic = 5;
        html.find(".cancel").on("hover:enter", () => {
          clearInterval(balanser_timer);
        });
        html.find(".change").on("hover:enter", () => {
          clearInterval(balanser_timer);
          filter.render().find(".filter--sort").trigger("hover:enter");
        });
        scroll.append(html);
        this.loading(false);
        balanser_timer = setInterval(() => {
          tic--;
          html.find(".timeout").text(tic);
          if (tic == 0) {
            clearInterval(balanser_timer);
            let keys = Lampa.Arrays.getKeys(sources);
            let indx = keys.indexOf(balanser);
            let next = keys[indx + 1];
            if (!next) next = keys[0];
            balanser = next;
            if (Lampa.Activity.active().activity == this.activity) this.changeBalanser(balanser);
          }
        }, 1e3);
      };
      this.getLastEpisode = function(items) {
        let last_episode = 0;
        items.forEach((e) => {
          if (typeof e.episode !== "undefined") last_episode = Math.max(last_episode, parseInt(e.episode));
        });
        return last_episode;
      };
      this.start = function() {
        if (Lampa.Activity.active().activity !== this.activity) return;
        if (!initialized) {
          initialized = true;
          this.initialize();
        }
        Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
        Lampa.Controller.add("content", {
          toggle: () => {
            Lampa.Controller.collectionSet(scroll.render(), files.render());
            Lampa.Controller.collectionFocus(last || false, scroll.render());
          },
          up: () => {
            if (Navigator.canmove("up")) {
              Navigator.move("up");
            } else Lampa.Controller.toggle("head");
          },
          down: () => {
            Navigator.move("down");
          },
          right: () => {
            if (Navigator.canmove("right")) Navigator.move("right");
            else filter.show(Lampa.Lang.translate("title_filter"), "filter");
          },
          left: () => {
            if (Navigator.canmove("left")) Navigator.move("left");
            else Lampa.Controller.toggle("menu");
          },
          gone: () => {
            clearInterval(balanser_timer);
          },
          back: this.back
        });
        Lampa.Controller.toggle("content");
      };
      this.render = function() {
        return files.render();
      };
      this.back = function() {
        Lampa.Activity.backward();
      };
      this.pause = function() {
      };
      this.stop = function() {
      };
      this.destroy = function() {
        network.clear();
        this.clearImages();
        files.destroy();
        scroll.destroy();
        clearInterval(balanser_timer);
        if (source) source.destroy();
      };
    }

    function startPlugin() {
      window.online_prestige = true;
      let manifest = {
        type: "video",
        version: "1.0.9",
        name: "\u041E\u043D\u043B\u0430\u0439\u043D - Prestige",
        description: "\u041F\u043B\u0430\u0433\u0438\u043D \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u043E\u043D\u043B\u0430\u0439\u043D \u0441\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0438 \u0444\u0438\u043B\u044C\u043C\u043E\u0432",
        component: "online_prestige",
        onContextMenu: (object) => {
          return {
            name: Lampa.Lang.translate("online_watch"),
            description: ""
          };
        },
        onContextLauch: (object) => {
          resetTemplates();
          Lampa.Component.add("online_prestige", component);
          Lampa.Activity.push({
            url: "",
            title: Lampa.Lang.translate("title_online"),
            component: "online_prestige",
            search: object.title,
            search_one: object.title,
            search_two: object.original_title,
            movie: object,
            page: 1
          });
        }
      };
      Lampa.Manifest.plugins = manifest;
      Lampa.Lang.add({
        online_watch: {
          ru: "\u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u043D\u043B\u0430\u0439\u043D",
          en: "Watch online",
          ua: "\u0414\u0438\u0432\u0438\u0442\u0438\u0441\u044F \u043E\u043D\u043B\u0430\u0439\u043D",
          zh: "\u5728\u7EBF\u89C2\u770B"
        },
        online_no_watch_history: {
          ru: "\u041D\u0435\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430",
          en: "No browsing history",
          ua: "\u041D\u0435\u043C\u0430\u0454 \u0456\u0441\u0442\u043E\u0440\u0456\u0457 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0443",
          zh: "\u6CA1\u6709\u6D4F\u89C8\u5386\u53F2"
        },
        online_video: {
          ru: "\u0412\u0438\u0434\u0435\u043E",
          en: "Video",
          ua: "\u0412\u0456\u0434\u0435\u043E",
          zh: "\u89C6\u9891"
        },
        online_nolink: {
          ru: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u0437\u0432\u043B\u0435\u0447\u044C \u0441\u0441\u044B\u043B\u043A\u0443",
          uk: "\u041D\u0435\u043C\u043E\u0436\u043B\u0438\u0432\u043E \u043E\u0442\u0440\u0438\u043C\u0430\u0442\u0438 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F",
          en: "Failed to fetch link",
          zh: "\u83B7\u53D6\u94FE\u63A5\u5931\u8D25"
        },
        online_waitlink: {
          ru: "\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u043C \u043D\u0430\u0434 \u0438\u0437\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u0435\u043C \u0441\u0441\u044B\u043B\u043A\u0438, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435...",
          uk: "\u041F\u0440\u0430\u0446\u044E\u0454\u043C\u043E \u043D\u0430\u0434 \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043D\u044F\u043C \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F, \u0437\u0430\u0447\u0435\u043A\u0430\u0439\u0442\u0435...",
          en: "Working on extracting the link, please wait...",
          zh: "\u6B63\u5728\u63D0\u53D6\u94FE\u63A5\uFF0C\u8BF7\u7A0D\u5019..."
        },
        online_balanser: {
          ru: "\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440",
          uk: "\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440",
          en: "Balancer",
          zh: "\u5E73\u8861\u5668"
        },
        helper_online_file: {
          ru: '\u0423\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0439\u0442\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0443 "\u041E\u041A" \u0434\u043B\u044F \u0432\u044B\u0437\u043E\u0432\u0430 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0433\u043E \u043C\u0435\u043D\u044E',
          uk: '\u0423\u0442\u0440\u0438\u043C\u0443\u0439\u0442\u0435 \u043A\u043B\u0430\u0432\u0456\u0448\u0443 "\u041E\u041A" \u0434\u043B\u044F \u0432\u0438\u043A\u043B\u0438\u043A\u0443 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0433\u043E \u043C\u0435\u043D\u044E',
          en: 'Hold the "OK" key to bring up the context menu',
          zh: "\u6309\u4F4F\u201C\u786E\u5B9A\u201D\u952E\u8C03\u51FA\u4E0A\u4E0B\u6587\u83DC\u5355"
        },
        online_query_start: {
          ru: "\u041F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443",
          uk: "\u041D\u0430 \u0437\u0430\u043F\u0438\u0442",
          en: "On request",
          zh: "\u6839\u636E\u8981\u6C42"
        },
        online_query_end: {
          ru: "\u043D\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432",
          uk: "\u043D\u0435\u043C\u0430\u0454 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0456\u0432",
          en: "no results",
          zh: "\u6CA1\u6709\u7ED3\u679C"
        },
        title_online: {
          ru: "\u041E\u043D\u043B\u0430\u0439\u043D",
          uk: "\u041E\u043D\u043B\u0430\u0439\u043D",
          en: "Online",
          zh: "\u5728\u7EBF\u7684"
        },
        title_proxy: {
          ru: "\u041F\u0440\u043E\u043A\u0441\u0438",
          uk: "\u041F\u0440\u043E\u043A\u0441\u0456",
          en: "Proxy",
          zh: "\u4EE3\u7406\u4EBA"
        },
        online_proxy_title: {
          ru: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043F\u0440\u043E\u043A\u0441\u0438",
          uk: "\u041E\u0441\u043D\u043E\u0432\u043D\u0438\u0439 \u043F\u0440\u043E\u043A\u0441\u0456",
          en: "Main proxy",
          zh: "\u4E3B\u8981\u4EE3\u7406"
        },
        online_proxy_descr: {
          ru: "\u0411\u0443\u0434\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0431\u0430\u043B\u0430\u043D\u0441\u0435\u0440\u043E\u0432",
          uk: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u0442\u0438\u043C\u0435\u0442\u044C\u0441\u044F \u0434\u043B\u044F \u0432\u0441\u0456\u0445 \u0431\u0430\u043B\u0430\u043D\u0441\u0435\u0440\u0456\u0432",
          en: "Will be used for all balancers",
          zh: "\u5C06\u7528\u4E8E\u6240\u6709\u5E73\u8861\u5668"
        },
        online_proxy_placeholder: {
          ru: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: http://proxy.com",
          uk: "\u041D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434: http://proxy.com",
          en: "For example: http://proxy.com",
          zh: "\u4F8B\u5982\uFF1Ahttp://proxy.com"
        },
        filmix_param_add_title: {
          ru: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0422\u041E\u041A\u0415\u041D \u043E\u0442 Filmix",
          uk: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0422\u041E\u041A\u0415\u041D \u0432\u0456\u0434 Filmix",
          en: "Add TOKEN from Filmix",
          zh: "\u4ECE Filmix \u6DFB\u52A0 TOKEN"
        },
        filmix_param_add_descr: {
          ru: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0422\u041E\u041A\u0415\u041D \u0434\u043B\u044F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438",
          uk: "\u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u0422\u041E\u041A\u0415\u041D \u0434\u043B\u044F \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u043F\u0435\u0440\u0435\u0434\u043F\u043B\u0430\u0442\u0438",
          en: "Add a TOKEN to connect a subscription",
          zh: "\u6DFB\u52A0 TOKEN \u4EE5\u8FDE\u63A5\u8BA2\u9605"
        },
        filmix_param_placeholder: {
          ru: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: nxjekeb57385b..",
          uk: "\u041D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434: nxjekeb57385b..",
          en: "For example: nxjekeb57385b..",
          zh: "\u4F8B\u5982\uFF1Anxjekeb57385b.."
        },
        filmix_param_add_device: {
          ru: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0430 Filmix",
          uk: "\u0414\u043E\u0434\u0430\u0442\u0438 \u043F\u0440\u0438\u0441\u0442\u0440\u0456\u0439 \u043D\u0430 Filmix",
          en: "Add Device to Filmix",
          zh: "\u5C06\u8BBE\u5907\u6DFB\u52A0\u5230 Filmix"
        },
        filmix_modal_text: {
          ru: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0435\u0433\u043E \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 https://filmix.ac/consoles \u0432 \u0432\u0430\u0448\u0435\u043C \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u043E\u043C \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435!",
          uk: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u0439\u043E\u0433\u043E \u043D\u0430 \u0441\u0442\u043E\u0440\u0456\u043D\u0446\u0456 https://filmix.ac/consoles \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E\u043C\u0443 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456!",
          en: "Enter it at https://filmix.ac/consoles in your authorized account!",
          zh: "\u5728\u60A8\u7684\u6388\u6743\u5E10\u6237\u4E2D\u7684 https://filmix.ac/consoles \u4E2D\u8F93\u5165\uFF01"
        },
        filmix_modal_wait: {
          ru: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u043A\u043E\u0434",
          uk: "\u041E\u0447\u0456\u043A\u0443\u0454\u043C\u043E \u043A\u043E\u0434",
          en: "Waiting for the code",
          zh: "\u6211\u4EEC\u6B63\u5728\u7B49\u5F85\u4EE3\u7801"
        },
        filmix_copy_secuses: {
          ru: "\u041A\u043E\u0434 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430",
          uk: "\u041A\u043E\u0434 \u0441\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0456\u043D\u0443",
          en: "Code copied to clipboard",
          zh: "\u4EE3\u7801\u590D\u5236\u5230\u526A\u8D34\u677F"
        },
        filmix_copy_fail: {
          ru: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0438",
          uk: "\u041F\u043E\u043C\u0438\u043B\u043A\u0430 \u043F\u0440\u0438 \u043A\u043E\u043F\u0456\u044E\u0432\u0430\u043D\u043D\u0456",
          en: "Copy error",
          zh: "\u590D\u5236\u9519\u8BEF"
        },
        filmix_nodevice: {
          ru: "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E",
          uk: "\u041F\u0440\u0438\u0441\u0442\u0440\u0456\u0439 \u043D\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u0438\u0439",
          en: "Device not authorized",
          zh: "\u8BBE\u5907\u672A\u6388\u6743"
        },
        title_status: {
          ru: "\u0421\u0442\u0430\u0442\u0443\u0441",
          uk: "\u0421\u0442\u0430\u0442\u0443\u0441",
          en: "Status",
          zh: "\u5730\u4F4D"
        },
        online_voice_subscribe: {
          ru: "\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434",
          uk: "\u041F\u0456\u0434\u043F\u0438\u0441\u0430\u0442\u0438\u0441\u044F \u043D\u0430 \u043F\u0435\u0440\u0435\u043A\u043B\u0430\u0434",
          en: "Subscribe to translation",
          zh: "\u8BA2\u9605\u7FFB\u8BD1"
        },
        online_voice_success: {
          ru: "\u0412\u044B \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043B\u0438\u0441\u044C",
          uk: "\u0412\u0438 \u0443\u0441\u043F\u0456\u0448\u043D\u043E \u043F\u0456\u0434\u043F\u0438\u0441\u0430\u043B\u0438\u0441\u044F",
          en: "You have successfully subscribed",
          zh: "\u60A8\u5DF2\u6210\u529F\u8BA2\u9605"
        },
        online_voice_error: {
          ru: "\u0412\u043E\u0437\u043D\u0438\u043A\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430",
          uk: "\u0412\u0438\u043D\u0438\u043A\u043B\u0430 \u043F\u043E\u043C\u0438\u043B\u043A\u0430",
          en: "An error has occurred",
          zh: "\u53D1\u751F\u4E86\u9519\u8BEF"
        },
        online_clear_all_marks: {
          ru: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435 \u043C\u0435\u0442\u043A\u0438",
          uk: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0441\u0456 \u043C\u0456\u0442\u043A\u0438",
          en: "Clear all labels",
          zh: "\u6E05\u9664\u6240\u6709\u6807\u7B7E"
        },
        online_clear_all_timecodes: {
          ru: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435 \u0442\u0430\u0439\u043C-\u043A\u043E\u0434\u044B",
          uk: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0441\u0456 \u0442\u0430\u0439\u043C-\u043A\u043E\u0434\u0438",
          en: "Clear all timecodes",
          zh: "\u6E05\u9664\u6240\u6709\u65F6\u95F4\u4EE3\u7801"
        },
        online_change_balanser: {
          ru: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0431\u0430\u043B\u0430\u043D\u0441\u0435\u0440",
          uk: "\u0417\u043C\u0456\u043D\u0438\u0442\u0438 \u0431\u0430\u043B\u0430\u043D\u0441\u0435\u0440",
          en: "Change balancer",
          zh: "\u66F4\u6539\u5E73\u8861\u5668"
        },
        online_balanser_dont_work: {
          ru: "\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440 ({balanser}) \u043D\u0435 \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u043D\u0430 \u0437\u0430\u043F\u0440\u043E\u0441.",
          uk: "\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440 ({balanser}) \u043D\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454 \u043D\u0430 \u0437\u0430\u043F\u0438\u0442.",
          en: "Balancer ({balanser}) does not respond to the request.",
          zh: "\u5E73\u8861\u5668\uFF08{balanser}\uFF09\u672A\u54CD\u5E94\u8BF7\u6C42\u3002"
        },
        online_balanser_timeout: {
          ru: '\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440 \u0431\u0443\u0434\u0435\u0442 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0447\u0435\u0440\u0435\u0437 <span class="timeout">10</span> \u0441\u0435\u043A\u0443\u043D\u0434.',
          uk: '\u0411\u0430\u043B\u0430\u043D\u0441\u0435\u0440 \u0431\u0443\u0434\u0435 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0447\u0435\u0440\u0435\u0437 <span class="timeout">10</span> \u0441\u0435\u043A\u0443\u043D\u0434.',
          en: 'Balancer will be switched automatically in <span class="timeout">10</span> seconds.',
          zh: '\u5E73\u8861\u5668\u5C06\u5728<span class="timeout">10</span>\u79D2\u5185\u81EA\u52A8\u5207\u6362\u3002'
        }
      });
      Lampa.Template.add("online_prestige_css", `
        <style>
        @charset 'UTF-8';.online-prestige {  position: relative;  -webkit-border-radius: 0.3em;          border-radius: 0.3em;  background-color: rgba(0, 0, 0, 0.3);  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  will-change: transform;}.online-prestige__body {  padding: 1.2em;  line-height: 1.3;  -webkit-box-flex: 1;  -webkit-flex-grow: 1;      -ms-flex-positive: 1;          flex-grow: 1;  position: relative;}@media screen and (max-width: 480px) {  .online-prestige__body {    padding: 0.8em 1.2em;  }}.online-prestige__img {  position: relative;  width: 13em;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  min-height: 8.2em;}.online-prestige__img > img {  position: absolute;  top: 0;  left: 0;  width: 100%;  height: 100%;  -o-object-fit: cover;     object-fit: cover;  -webkit-border-radius: 0.3em;          border-radius: 0.3em;  opacity: 0;  -webkit-transition: opacity 0.3s;  -o-transition: opacity 0.3s;  transition: opacity 0.3s;}.online-prestige__img--loaded > img {  opacity: 1;}@media screen and (max-width: 480px) {  .online-prestige__img {    width: 7em;    min-height: 6em;  }}.online-prestige__folder {  padding: 1em;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.online-prestige__folder > svg {  width: 4.4em !important;  height: 4.4em !important;}.online-prestige__viewed {  position: absolute;  top: 1em;  left: 1em;  background: rgba(0, 0, 0, 0.45);  -webkit-border-radius: 100%;          border-radius: 100%;  padding: 0.25em;  font-size: 0.76em;}.online-prestige__viewed > svg {  width: 1.5em !important;  height: 1.5em !important;}.online-prestige__episode-number {  position: absolute;  top: 0;  left: 0;  right: 0;  bottom: 0;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-box-pack: center;  -webkit-justify-content: center;      -ms-flex-pack: center;          justify-content: center;  font-size: 2em;}.online-prestige__loader {  position: absolute;  top: 50%;  left: 50%;  width: 2em;  height: 2em;  margin-left: -1em;  margin-top: -1em;  background: url(./img/loader.svg) no-repeat center center;  background-size: contain;}.online-prestige__head, .online-prestige__footer {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-pack: justify;  -webkit-justify-content: space-between;      -ms-flex-pack: justify;          justify-content: space-between;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.online-prestige__timeline {  margin: 0.8em 0;}.online-prestige__timeline > .time-line {  display: block !important;}.online-prestige__title {  font-size: 1.7em;  overflow: hidden;  -o-text-overflow: ellipsis;     text-overflow: ellipsis;  display: -webkit-box;  -webkit-line-clamp: 1;  line-clamp: 1;  -webkit-box-orient: vertical;}@media screen and (max-width: 480px) {  .online-prestige__title {    font-size: 1.4em;  }}.online-prestige__time {  padding-left: 2em;}.online-prestige__info {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.online-prestige__info > * {  overflow: hidden;  -o-text-overflow: ellipsis;     text-overflow: ellipsis;  display: -webkit-box;  -webkit-line-clamp: 1;  line-clamp: 1;  -webkit-box-orient: vertical;}.online-prestige__quality {  padding-left: 1em;  white-space: nowrap;}.online-prestige__scan-file {  position: absolute;  bottom: 0;  left: 0;  right: 0;}.online-prestige__scan-file .broadcast__scan {  margin: 0;}.online-prestige .online-prestige-split {  font-size: 0.8em;  margin: 0 1em;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.online-prestige.focus::after {  content: '';  position: absolute;  top: -0.6em;  left: -0.6em;  right: -0.6em;  bottom: -0.6em;  -webkit-border-radius: 0.7em;          border-radius: 0.7em;  border: solid 0.3em #fff;  z-index: -1;  pointer-events: none;}.online-prestige + .online-prestige {  margin-top: 1.5em;}.online-prestige--folder .online-prestige__footer {  margin-top: 0.8em;}.online-prestige-watched {  padding: 1em;}.online-prestige-watched__icon > svg {  width: 1.5em;  height: 1.5em;}.online-prestige-watched__body {  padding-left: 1em;  padding-top: 0.1em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-flex-wrap: wrap;      -ms-flex-wrap: wrap;          flex-wrap: wrap;}.online-prestige-watched__body > span + span::before {  content: ' ● ';  vertical-align: top;  display: inline-block;  margin: 0 0.5em;}.online-prestige-rate {  display: -webkit-inline-box;  display: -webkit-inline-flex;  display: -ms-inline-flexbox;  display: inline-flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.online-prestige-rate > svg {  width: 1.3em !important;  height: 1.3em !important;}.online-prestige-rate > span {  font-weight: 600;  font-size: 1.1em;  padding-left: 0.7em;}.online-empty {  line-height: 1.4;}.online-empty__title {  font-size: 1.8em;  margin-bottom: 0.3em;}.online-empty__time {  font-size: 1.2em;  font-weight: 300;  margin-bottom: 1.6em;}.online-empty__buttons {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;}.online-empty__buttons > * + * {  margin-left: 1em;}.online-empty__button {  background: rgba(0, 0, 0, 0.3);  font-size: 1.2em;  padding: 0.5em 1.2em;  -webkit-border-radius: 0.2em;          border-radius: 0.2em;  margin-bottom: 2.4em;}.online-empty__button.focus {  background: #fff;  color: black;}.online-empty__templates .online-empty-template:nth-child(2) {  opacity: 0.5;}.online-empty__templates .online-empty-template:nth-child(3) {  opacity: 0.2;}.online-empty-template {  background-color: rgba(255, 255, 255, 0.3);  padding: 1em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-border-radius: 0.3em;          border-radius: 0.3em;}.online-empty-template > * {  background: rgba(0, 0, 0, 0.3);  -webkit-border-radius: 0.3em;          border-radius: 0.3em;}.online-empty-template__ico {  width: 4em;  height: 4em;  margin-right: 2.4em;}.online-empty-template__body {  height: 1.7em;  width: 70%;}.online-empty-template + .online-empty-template {  margin-top: 1em;}
        </style>
    `);
      $("body").append(Lampa.Template.get("online_prestige_css", {}, true));
      function resetTemplates() {
        Lampa.Template.add("online_prestige_full", `<div class="online-prestige online-prestige--full selector">
            <div class="online-prestige__img">
                <img alt="">
                <div class="online-prestige__loader"></div>
            </div>
            <div class="online-prestige__body">
                <div class="online-prestige__head">
                    <div class="online-prestige__title">{title}</div>
                    <div class="online-prestige__time">{time}</div>
                </div>

                <div class="online-prestige__timeline"></div>

                <div class="online-prestige__footer">
                    <div class="online-prestige__info">{info}</div>
                    <div class="online-prestige__quality">{quality}</div>
                </div>
            </div>
        </div>`);
        Lampa.Template.add("online_does_not_answer", `<div class="online-empty">
            <div class="online-empty__title">
                #{online_balanser_dont_work}
            </div>
            <div class="online-empty__time">
                #{online_balanser_timeout}
            </div>
            <div class="online-empty__buttons">
                <div class="online-empty__button selector cancel">#{cancel}</div>
                <div class="online-empty__button selector change">#{online_change_balanser}</div>
            </div>
            <div class="online-empty__templates">
                <div class="online-empty-template">
                    <div class="online-empty-template__ico"></div>
                    <div class="online-empty-template__body"></div>
                </div>
                <div class="online-empty-template">
                    <div class="online-empty-template__ico"></div>
                    <div class="online-empty-template__body"></div>
                </div>
                <div class="online-empty-template">
                    <div class="online-empty-template__ico"></div>
                    <div class="online-empty-template__body"></div>
                </div>
            </div>
        </div>`);
        Lampa.Template.add("online_prestige_rate", `<div class="online-prestige-rate">
            <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.39409 0.192139L10.99 5.30994L16.7882 6.20387L12.5475 10.4277L13.5819 15.9311L8.39409 13.2425L3.20626 15.9311L4.24065 10.4277L0 6.20387L5.79819 5.30994L8.39409 0.192139Z" fill="#fff"></path>
            </svg>
            <span>{rate}</span>
        </div>`);
        Lampa.Template.add("online_prestige_folder", `<div class="online-prestige online-prestige--folder selector">
            <div class="online-prestige__folder">
                <svg viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect y="20" width="128" height="92" rx="13" fill="white"></rect>
                    <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"></path>
                    <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"></rect>
                </svg>
            </div>
            <div class="online-prestige__body">
                <div class="online-prestige__head">
                    <div class="online-prestige__title">{title}</div>
                    <div class="online-prestige__time">{time}</div>
                </div>

                <div class="online-prestige__footer">
                    <div class="online-prestige__info">{info}</div>
                </div>
            </div>
        </div>`);
        Lampa.Template.add("online_prestige_watched", `<div class="online-prestige online-prestige-watched selector">
            <div class="online-prestige-watched__icon">
                <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="10.5" cy="10.5" r="9" stroke="currentColor" stroke-width="3"/>
                    <path d="M14.8477 10.5628L8.20312 14.399L8.20313 6.72656L14.8477 10.5628Z" fill="currentColor"/>
                </svg>
            </div>
            <div class="online-prestige-watched__body">
                
            </div>
        </div>`);
      }
      const button = `<div class="full-start__button selector view--online" data-subtitle="Prestige v${manifest.version}">
        <svg width="135" height="147" viewBox="0 0 135 147" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M121.5 96.8823C139.5 86.49 139.5 60.5092 121.5 50.1169L41.25 3.78454C23.25 -6.60776 0.750004 6.38265 0.750001 27.1673L0.75 51.9742C4.70314 35.7475 23.6209 26.8138 39.0547 35.7701L94.8534 68.1505C110.252 77.0864 111.909 97.8693 99.8725 109.369L121.5 96.8823Z" fill="currentColor"/>
            <path d="M63 84.9836C80.3333 94.991 80.3333 120.01 63 130.017L39.75 143.44C22.4167 153.448 0.749999 140.938 0.75 120.924L0.750001 94.0769C0.750002 74.0621 22.4167 61.5528 39.75 71.5602L63 84.9836Z" fill="currentColor"/>
        </svg>

        <span>#{title_online}</span>
    </div>`;
      Lampa.Component.add("online_prestige", component);
      resetTemplates();
      Lampa.Listener.follow("full", (e) => {
        if (e.type == "complite") {
          let render_root = e.object.activity.render();
          let existing = render_root.find(".view--online");
          let btn = existing.length ? existing : $(Lampa.Lang.translate(button));
          btn.attr("data-subtitle", "Collaps / Kinobase / HDRezka / Filmix");
          btn.unbind("hover:enter").on("hover:enter", () => {
            resetTemplates();
            Lampa.Component.add("online_prestige", component);
            Lampa.Activity.push({
              url: "",
              title: Lampa.Lang.translate("title_online"),
              component: "online_prestige",
              search: e.data.movie.title,
              search_one: e.data.movie.title,
              search_two: e.data.movie.original_title,
              movie: e.data.movie,
              page: 1
            });
          });
          if (!existing.length) render_root.find(".view--torrent").after(btn);
        }
      });
      Lampa.Params.select("online_proxy_all", "", "");
      Lampa.Params.select("online_proxy_videocdn", "", "");
      Lampa.Params.select("online_proxy_rezka", "", "");
      Lampa.Params.select("online_proxy_kinobase", "", "");
      Lampa.Params.select("online_proxy_collaps", "", "");
      Lampa.Template.add("settings_proxy", `<div>
        <div class="settings-param selector" data-type="input" data-name="online_proxy_all" placeholder="#{online_proxy_placeholder}">
            <div class="settings-param__name">#{online_proxy_title}</div>
            <div class="settings-param__value"></div>
            <div class="settings-param__descr">#{online_proxy_descr}</div>
        </div>

        <div class="settings-param selector" data-type="input" data-name="online_proxy_videocdn" placeholder="#{online_proxy_placeholder}">
            <div class="settings-param__name">Videocdn</div>
            <div class="settings-param__value"></div>
        </div>

        <div class="settings-param selector" data-type="input" data-name="online_proxy_rezka" placeholder="#{online_proxy_placeholder}">
            <div class="settings-param__name">Rezka</div>
            <div class="settings-param__value"></div>
        </div>

        <div class="settings-param selector" data-type="input" data-name="online_proxy_kinobase" placeholder="#{online_proxy_placeholder}">
            <div class="settings-param__name">Kinobase</div>
            <div class="settings-param__value"></div>
        </div>

        <div class="settings-param selector" data-type="input" data-name="online_proxy_collaps" placeholder="#{online_proxy_placeholder}">
            <div class="settings-param__name">Collaps</div>
            <div class="settings-param__value"></div>
        </div>
    </div>`);
      function addSettingsProxy() {
        if (Lampa.Settings.main && !Lampa.Settings.main().render().find('[data-component="proxy"]').length) {
          let field = $(Lampa.Lang.translate(`<div class="settings-folder selector" data-component="proxy">
                <div class="settings-folder__icon">
                    <svg height="46" viewBox="0 0 42 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1.5" y="26.5" width="39" height="18" rx="1.5" stroke="white" stroke-width="3"/>
                    <circle cx="9.5" cy="35.5" r="3.5" fill="white"/>
                    <circle cx="26.5" cy="35.5" r="2.5" fill="white"/>
                    <circle cx="32.5" cy="35.5" r="2.5" fill="white"/>
                    <circle cx="21.5" cy="5.5" r="5.5" fill="white"/>
                    <rect x="31" y="4" width="11" height="3" rx="1.5" fill="white"/>
                    <rect y="4" width="11" height="3" rx="1.5" fill="white"/>
                    <rect x="20" y="14" width="3" height="7" rx="1.5" fill="white"/>
                    </svg>
                </div>
                <div class="settings-folder__name">#{title_proxy}</div>
            </div>`));
          Lampa.Settings.main().render().find('[data-component="more"]').after(field);
          Lampa.Settings.main().update();
        }
      }
      if (window.appready) addSettingsProxy();
      else {
        Lampa.Listener.follow("app", function(e) {
          if (e.type == "ready") addSettingsProxy();
        });
      }
      let network = new Lampa.Reguest();
      let api_url = "http://filmixapp.cyou/api/v2/";
      let user_dev = "?user_dev_apk=1.1.3&user_dev_id=" + Lampa.Utils.uid(16) + "&user_dev_name=Xiaomi&user_dev_os=11&user_dev_vendor=Xiaomi&user_dev_token=";
      Lampa.Params.select("filmix_token", "", "");
      Lampa.Template.add("settings_filmix", `<div>
        <div class="settings-param selector" data-name="filmix_token" data-type="input" placeholder="#{filmix_param_placeholder}">
            <div class="settings-param__name">#{filmix_param_add_title}</div>
            <div class="settings-param__value"></div>
            <div class="settings-param__descr">#{filmix_param_add_descr}</div>
        </div>
        <div class="settings-param selector" data-name="filmix_add" data-static="true">
            <div class="settings-param__name">#{filmix_param_add_device}</div>
        </div>
    </div>`);
      Lampa.Storage.listener.follow("change", (e) => {
        if (e.name == "filmix_token") {
          if (e.value) checkPro(e.value);
          else {
            Lampa.Storage.set("filmix_status", {});
            showStatus();
          }
        }
      });
      function setFilmixQuality() {
        window.filmix = {
          max_qualitie: 2160,
          is_max_qualitie: true
        };
      }
      function addSettingsFilmix() {
        if (Lampa.Settings.main && !Lampa.Settings.main().render().find('[data-component="filmix"]').length) {
          let field = $(`<div class="settings-folder selector" data-component="filmix">
                <div class="settings-folder__icon">
                    <svg height="57" viewBox="0 0 58 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 20.3735V45H26.8281V34.1262H36.724V26.9806H26.8281V24.3916C26.8281 21.5955 28.9062 19.835 31.1823 19.835H39V13H26.8281C23.6615 13 20 15.4854 20 20.3735Z" fill="white"/>
                    <rect x="2" y="2" width="54" height="53" rx="5" stroke="white" stroke-width="4"/>
                    </svg>
                </div>
                <div class="settings-folder__name">Filmix</div>
            </div>`);
          Lampa.Settings.main().render().find('[data-component="more"]').after(field);
          Lampa.Settings.main().update();
        }
      }
      if (window.appready) addSettingsFilmix();
      else {
        Lampa.Listener.follow("app", function(e) {
          if (e.type == "ready") addSettingsFilmix();
        });
      }
      setFilmixQuality();
      Lampa.Settings.listener.follow("open", function(e) {
        if (e.name == "filmix") {
          e.body.find('[data-name="filmix_add"]').unbind("hover:enter").on("hover:enter", () => {
            Lampa.Noty.show("CubPro VIP: \u0420\u0435\u0436\u0438\u043C Filmix PRO+ (4K UHD 2160p) \u0443\u0436\u0435 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D \u0431\u0435\u0437 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438");
          });
          showStatus();
        }
      });
      function showStatus() {
        let status = Lampa.Storage.get("filmix_status", "{}");
        let info = "CubPro VIP \u2014 PRO+ (4K UHD 2160p / 1080p) \u0410\u043A\u0442\u0438\u0432\u0435\u043D";
        if (status.login) {
          if (status.is_pro) info = status.login + " - PRO " + Lampa.Lang.translate("filter_rating_to") + " - " + status.pro_date;
          else if (status.is_pro_plus) info = status.login + " - PRO_PLUS " + Lampa.Lang.translate("filter_rating_to") + " - " + status.pro_date;
        }
        let field = $(Lampa.Lang.translate(`
            <div class="settings-param" data-name="filmix_status" data-static="true">
                <div class="settings-param__name">#{title_status}</div>
                <div class="settings-param__value">${info}</div>
            </div>`));
        $('.settings [data-name="filmix_status"]').remove();
        $('.settings [data-name="filmix_add"]').after(field);
      }
      function checkPro(token, call) {
        network.clear();
        network.timeout(8e3);
        network.silent(api_url + "user_profile" + user_dev + token, function(json) {
          if (json) {
            if (json.user_data) {
              Lampa.Storage.set("filmix_status", json.user_data);
            } else {
              Lampa.Storage.set("filmix_status", {});
            }
            showStatus();
          }
        }, function(a, c) {
          Lampa.Noty.show(network.errorDecode(a, c));
        });
      }
      if (Lampa.Manifest.app_digital >= 177) {
        Lampa.Storage.sync("online_choice_videocdn", "object_object");
        Lampa.Storage.sync("online_choice_rezka", "object_object");
        Lampa.Storage.sync("online_choice_kinobase", "object_object");
        Lampa.Storage.sync("online_choice_collaps", "object_object");
        Lampa.Storage.sync("online_choice_filmix", "object_object");
        Lampa.Storage.sync("online_watched_last", "object_object");
      }
    }
    if (!window.online_prestige && Lampa.Manifest.app_digital >= 155) startPlugin();

})();
