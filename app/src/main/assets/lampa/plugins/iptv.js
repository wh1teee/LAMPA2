(function () {
    'use strict';

    class Utils {
      static clear(str) {
        return str.replace(/\&quot;/g, '"').replace(/\&#039;/g, "'").replace(/\&amp;/g, "&").replace(/\&.+?;/g, "");
      }
      static isHD(name) {
        let math = name.toLowerCase().match(" .hd$| .\u043Dd$| .hd | .\u043Dd | hd$| \u043Dd&| hd | \u043Dd ");
        return math ? math[0].trim() : "";
      }
      static clearHDSD(name) {
        return name.replace(/ hd$| нd$| .hd$| .нd$/gi, "").replace(/ sd$/gi, "").replace(/ hd | нd | .hd | .нd /gi, " ").replace(/ sd /gi, " ");
      }
      static clearMenuName(name) {
        return name.replace(/^\d+\. /gi, "").replace(/^\d+ /gi, "");
      }
      static clearChannelName(name) {
        return this.clearHDSD(this.clear(name));
      }
      static hasArchive(channel) {
        if (channel.catchup) {
          let days = parseInt(channel.catchup.days);
          if (!isNaN(days) && days > 0) return days;
        }
        return 0;
      }
      static canUseDB() {
        return DB.db && Lampa.Storage.get("iptv_use_db", "indexdb") == "indexdb";
      }
    }

    let favorites = [];
    class Favorites {
      static load() {
        return new Promise((resolve, reject) => {
          if (Utils.canUseDB()) {
            DB.getData("favorites").then((result) => {
              favorites = result || [];
            }).finally(resolve);
          } else {
            this.nosuport();
            resolve();
          }
        });
      }
      static nosuport() {
        favorites = Lampa.Storage.get("iptv_favorite_channels", "[]");
      }
      static list() {
        return favorites;
      }
      static key() {
        return Lampa.Storage.get("iptv_favotite_save", "url");
      }
      static find(favorite) {
        return favorites.find((a) => a[this.key()] == favorite[this.key()]);
      }
      static remove(favorite) {
        return new Promise((resolve, reject) => {
          let find = favorites.find((a) => a[this.key()] == favorite[this.key()]);
          if (find) {
            if (Utils.canUseDB()) {
              DB.deleteData("favorites", favorite[this.key()]).then(() => {
                Lampa.Arrays.remove(favorites, find);
                resolve();
              }).catch(reject);
            } else {
              Lampa.Arrays.remove(favorites, find);
              Lampa.Storage.set("iptv_favorite_channels", favorites);
              resolve();
            }
          } else reject();
        });
      }
      static add(favorite) {
        return new Promise((resolve, reject) => {
          if (!favorites.find((a) => a[this.key()] == favorite[this.key()])) {
            Lampa.Arrays.extend(favorite, {
              view: 0,
              added: Date.now()
            });
            if (Utils.canUseDB()) {
              DB.addData("favorites", favorite[this.key()], favorite).then(() => {
                favorites.push(favorite);
                resolve();
              }).catch(reject);
            } else {
              favorites.push(favorite);
              Lampa.Storage.set("iptv_favorite_channels", favorites);
              resolve();
            }
          } else reject();
        });
      }
      static update(favorite) {
        return new Promise((resolve, reject) => {
          if (favorites.find((a) => a[this.key()] == favorite[this.key()])) {
            Lampa.Arrays.extend(favorite, {
              view: 0,
              added: Date.now()
            });
            if (Utils.canUseDB()) DB.updateData("favorites", favorite[this.key()], favorite).then(resolve).catch(reject);
            else {
              Lampa.Storage.set("iptv_favorite_channels", favorites);
              resolve();
            }
          } else reject();
        });
      }
      static toggle(favorite) {
        return this.find(favorite) ? this.remove(favorite) : this.add(favorite);
      }
    }

    let locked = [];
    class Locked {
      static load() {
        return new Promise((resolve, reject) => {
          if (Utils.canUseDB()) {
            DB.getData("locked").then((result) => {
              locked = result || [];
            }).finally(resolve);
          } else {
            this.nosuport();
            resolve();
          }
        });
      }
      static nosuport() {
        locked = Lampa.Storage.get("iptv_locked_channels", "[]");
      }
      static list() {
        return locked;
      }
      static find(key) {
        return locked.find((a) => a == key);
      }
      static format(type, element) {
        return type == "channel" ? "channel:" + element[Lampa.Storage.get("iptv_favotite_save", "url")] : type == "group" ? "group:" + element : "other:" + element;
      }
      static remove(key) {
        return new Promise((resolve, reject) => {
          let find = locked.find((a) => a == key);
          if (find) {
            if (Utils.canUseDB()) {
              DB.deleteData("locked", key).then(() => {
                Lampa.Arrays.remove(locked, find);
                resolve();
              }).catch(reject);
            } else {
              Lampa.Arrays.remove(locked, find);
              Lampa.Storage.set("iptv_locked_channels", locked);
              resolve();
            }
          } else reject();
        });
      }
      static add(key) {
        return new Promise((resolve, reject) => {
          if (!locked.find((a) => a == key)) {
            if (Utils.canUseDB()) {
              DB.addData("locked", key, key).then(() => {
                locked.push(key);
                resolve();
              }).catch(reject);
            } else {
              locked.push(key);
              Lampa.Storage.set("iptv_locked_channels", locked);
              resolve();
            }
          } else reject();
        });
      }
      static update(key) {
        return new Promise((resolve, reject) => {
          if (locked.find((a) => a == key)) {
            if (Utils.canUseDB()) DB.updateData("locked", key, key).then(resolve).catch(reject);
            else {
              Lampa.Storage.set("iptv_locked_channels", locked);
              resolve();
            }
          } else reject();
        });
      }
      static toggle(key) {
        return this.find(key) ? this.remove(key) : this.add(key);
      }
    }

    let DB = new Lampa.DB("cub_iptv", ["playlist", "params", "epg", "favorites", "other", "epg_channels", "locked"], 6);
    DB.logs = true;
    DB.openDatabase().then(() => {
      Favorites.load();
      Locked.load();
    }).catch(() => {
      Favorites.nosuport();
      Locked.nosuport();
    });

    function fixParams(params_data) {
      let params = params_data || {};
      Lampa.Arrays.extend(params, {
        update: "none",
        update_time: Date.now(),
        loading: "cub"
      });
      return params;
    }
    class Params {
      static get(id) {
        return new Promise((resolve) => {
          if (Utils.canUseDB()) {
            DB.getDataAnyCase("params", id).then((params) => {
              resolve(fixParams(params));
            });
          } else {
            resolve(fixParams(Lampa.Storage.get("iptv_playlist_params_" + id, "{}")));
          }
        });
      }
      static set(id, params) {
        if (Utils.canUseDB()) {
          return DB.rewriteData("params", id, fixParams(params));
        } else {
          return new Promise((resolve) => {
            Lampa.Storage.set("iptv_playlist_params_" + id, fixParams(params));
            resolve();
          });
        }
      }
      static value(params, name) {
        return Lampa.Lang.translate("iptv_params_" + params[name]);
      }
    }

    function isValidPath(string) {
      let url;
      try {
        url = new URL(string);
      } catch (_) {
        return false;
      }
      return url.protocol === "http:" || url.protocol === "https:";
    }
    const Parser$1 = {};
    Parser$1.parse = (content) => {
      let playlist = {
        header: {},
        items: []
      };
      let lines = content.split("\n").map(parseLine);
      let firstLine = lines.find((l) => l.index === 0);
      if (!firstLine || !/^#EXTM3U/.test(firstLine.raw)) throw new Error("Playlist is not valid");
      playlist.header = parseHeader(firstLine);
      let i = 0;
      const items = {};
      for (let line of lines) {
        if (line.index === 0) continue;
        const string = line.raw.toString().trim();
        if (string.startsWith("#EXTINF:")) {
          const EXTINF = string;
          items[i] = {
            name: EXTINF.getName(),
            tvg: {
              id: EXTINF.getAttribute("tvg-id"),
              name: EXTINF.getAttribute("tvg-name"),
              logo: EXTINF.getAttribute("tvg-logo"),
              url: EXTINF.getAttribute("tvg-url"),
              rec: EXTINF.getAttribute("tvg-rec")
            },
            group: {
              title: EXTINF.getAttribute("group-title")
            },
            http: {
              referrer: "",
              "user-agent": EXTINF.getAttribute("user-agent")
            },
            url: void 0,
            raw: line.raw,
            line: line.index + 1,
            catchup: {
              type: EXTINF.getAttribute("catchup"),
              days: EXTINF.getAttribute("catchup-days"),
              source: EXTINF.getAttribute("catchup-source")
            },
            timeshift: EXTINF.getAttribute("timeshift")
          };
        } else if (string.startsWith("#EXTVLCOPT:")) {
          if (!items[i]) continue;
          const EXTVLCOPT = string;
          items[i].http.referrer = EXTVLCOPT.getOption("http-referrer") || items[i].http.referrer;
          items[i].http["user-agent"] = EXTVLCOPT.getOption("http-user-agent") || items[i].http["user-agent"];
          items[i].raw += `\r
${line.raw}`;
        } else if (string.startsWith("#EXTGRP:")) {
          if (!items[i]) continue;
          const EXTGRP = string;
          items[i].group.title = EXTGRP.getValue() || items[i].group.title;
          items[i].raw += `\r
${line.raw}`;
        } else {
          if (!items[i]) continue;
          const url = string.getURL();
          const user_agent = string.getParameter("user-agent");
          const referrer = string.getParameter("referer");
          if (url && isValidPath(url)) {
            items[i].url = url;
            items[i].http["user-agent"] = user_agent || items[i].http["user-agent"];
            items[i].http.referrer = referrer || items[i].http.referrer;
            items[i].raw += `\r
${line.raw}`;
            i++;
          } else {
            if (!items[i]) continue;
            items[i].raw += `\r
${line.raw}`;
          }
        }
      }
      playlist.items = Object.values(items);
      return playlist;
    };
    function parseLine(line, index) {
      return {
        index,
        raw: line
      };
    }
    function parseHeader(line) {
      const supportedAttrs = ["x-tvg-url", "url-tvg"];
      let attrs = {};
      for (let attrName of supportedAttrs) {
        const tvgUrl = line.raw.getAttribute(attrName);
        if (tvgUrl) {
          attrs[attrName] = tvgUrl;
        }
      }
      return {
        attrs,
        raw: line.raw
      };
    }
    String.prototype.getName = function() {
      let name = this.split(/[\r\n]+/).shift().split(",").pop();
      return name || "";
    };
    String.prototype.getAttribute = function(name) {
      let regex = new RegExp(name + '="(.*?)"', "gi");
      let match = regex.exec(this);
      return match && match[1] ? match[1] : "";
    };
    String.prototype.getOption = function(name) {
      let regex = new RegExp(":" + name + "=(.*)", "gi");
      let match = regex.exec(this);
      return match && match[1] && typeof match[1] === "string" ? match[1].replace(/\"/g, "") : "";
    };
    String.prototype.getValue = function(name) {
      let regex = new RegExp(":(.*)", "gi");
      let match = regex.exec(this);
      return match && match[1] && typeof match[1] === "string" ? match[1].replace(/\"/g, "") : "";
    };
    String.prototype.getURL = function() {
      return this.split("|")[0] || "";
    };
    String.prototype.getParameter = function(name) {
      const params = this.replace(/^(.*)\|/, "");
      const regex = new RegExp(name + "=(\\w[^&]*)", "gi");
      const match = regex.exec(params);
      return match && match[1] ? match[1] : "";
    };

    var __defProp$1 = Object.defineProperty;
    var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
    class Api {
      static get(method, catch_error) {
        return new Promise((resolve) => {
          resolve();
        });
      }
      static time(call) {
        call({ time: Date.now() });
      }
      static m3u(url) {
        return this.m3uClient(url);
      }
      static defaultPlaylists() {
        return [
          {
            id: "cubpro_hd_builtin",
            custom: true,
            builtin: true,
            url: "builtin://cubpro_hd",
            name: "CubPro VIP HD (\u041A\u0438\u043D\u043E, \u041D\u0430\u0443\u043A\u0430, \u041C\u0443\u0437\u044B\u043A\u0430, 4K)"
          },
          {
            id: "iptv_org_rus",
            custom: true,
            url: "https://iptv-org.github.io/iptv/languages/rus.m3u",
            name: "\u0422\u0412-\u043A\u0430\u043D\u0430\u043B\u044B \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C (IPTV-org HD)"
          }
        ];
      }
      static builtinPlaylistData() {
        let channels = [
          { id: "redbull_tv", name: "Red Bull TV HD (\u042D\u043A\u0441\u0442\u0440\u0438\u043C \u0438 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u043E\u0435)", group: "\u041F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0438 \u0421\u043F\u043E\u0440\u0442", url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8", logo: null, catchup: {}, tvg: {} },
          { id: "nasa_tv", name: "NASA TV UHD (\u041A\u043E\u0441\u043C\u043E\u0441 \u0432 \u043F\u0440\u044F\u043C\u043E\u043C \u044D\u0444\u0438\u0440\u0435)", group: "\u041F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0438 \u0421\u043F\u043E\u0440\u0442", url: "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8", logo: null, catchup: {}, tvg: {} },
          { id: "rakuten_action", name: "Rakuten Action Movies HD", group: "\u041A\u0438\u043D\u043E \u0438 \u0421\u0435\u0440\u0438\u0430\u043B\u044B", url: "https://rakuten-actionmovies-1-eu.rakuten.wurl.tv/playlist.m3u8", logo: null, catchup: {}, tvg: {} },
          { id: "rakuten_comedy", name: "Rakuten Comedy Movies HD", group: "\u041A\u0438\u043D\u043E \u0438 \u0421\u0435\u0440\u0438\u0430\u043B\u044B", url: "https://rakuten-comedymovies-1-eu.rakuten.wurl.tv/playlist.m3u8", logo: null, catchup: {}, tvg: {} },
          { id: "fashion_tv", name: "Fashion TV 4K / HD", group: "\u0421\u0442\u0438\u043B\u044C \u0438 \u041C\u0443\u0437\u044B\u043A\u0430", url: "https://fashiontv-fashiontv-1-eu.rakuten.wurl.tv/playlist.m3u8", logo: null, catchup: {}, tvg: {} },
          { id: "euronews_ru", name: "Euronews HD", group: "\u041D\u043E\u0432\u043E\u0441\u0442\u0438", url: "https://rakuten-euronews-1-gb.samsung.wurl.tv/playlist.m3u8", logo: null, catchup: {}, tvg: {} }
        ];
        return {
          name: "CubPro VIP HD (\u041A\u0438\u043D\u043E, \u041D\u0430\u0443\u043A\u0430, \u041C\u0443\u0437\u044B\u043A\u0430, 4K)",
          secuses: true,
          playlist: {
            menu: [
              { name: "", count: channels.length },
              { name: "\u041A\u0438\u043D\u043E \u0438 \u0421\u0435\u0440\u0438\u0430\u043B\u044B", count: 2 },
              { name: "\u041F\u043E\u0437\u043D\u0430\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0438 \u0421\u043F\u043E\u0440\u0442", count: 2 },
              { name: "\u0421\u0442\u0438\u043B\u044C \u0438 \u041C\u0443\u0437\u044B\u043A\u0430", count: 1 },
              { name: "\u041D\u043E\u0432\u043E\u0441\u0442\u0438", count: 1 }
            ],
            channels
          }
        };
      }
      static list() {
        return new Promise((resolve, reject) => {
          DB.getDataAnyCase("playlist", "list").then((saved) => {
            let playlist = saved || { list: [] };
            let custom = Lampa.Storage.get("iptv_playlist_custom", "[]");
            let defaults = this.defaultPlaylists();
            let merged = [];
            let seen = {};
            defaults.concat(playlist.list || []).concat(custom).forEach((item) => {
              if (item && item.id && !seen[item.id]) {
                seen[item.id] = true;
                merged.push(item);
              }
            });
            resolve({ list: merged });
          }).catch(() => {
            resolve({ list: this.defaultPlaylists().concat(Lampa.Storage.get("iptv_playlist_custom", "[]")) });
          });
        });
      }
      static m3uClient(url) {
        return new Promise((resolve, reject) => {
          this.network.timeout(2e4);
          this.network[window.god_enabled ? "native" : "silent"](url, (str) => {
            if (typeof str != "string" || str.substr(0, 7).toUpperCase() !== "#EXTM3U") {
              return reject(Lampa.Lang.translate("torrent_parser_request_error") + " [M3UClient Function (The file is not M3U)]");
            }
            let list;
            let catchup;
            try {
              str = str.replace(/tvg-rec="(\d+)"/g, 'catchup="default" catchup-days="$1"');
              list = Parser$1.parse(str);
            } catch (e) {
            }
            if (list && list.items) {
              let channels = [];
              if (list.header.raw.indexOf("catchup") >= 0) {
                catchup = {
                  days: 0,
                  source: "",
                  type: ""
                };
                let m_days = list.header.raw.match(/catchup-days="(\d+)"/);
                let m_type = list.header.raw.match(/catchup="([a-z]+)"/);
                let m_source = list.header.raw.match(/catchup-source="(.*?)"/);
                if (m_days) catchup.days = m_days[1];
                if (m_type) catchup.type = m_type[1];
                if (m_source) catchup.source = m_source[1];
              }
              for (let i = 0; i < list.items.length; i++) {
                let item = list.items[i];
                let name = item.name.trim();
                let channel = {
                  id: item.tvg && item.tvg.id ? item.tvg.id : null,
                  name: name.replace(/ \((\+\d+)\)/g, " $1").replace(/\s+(\s|ⓢ|ⓖ|ⓥ|ⓞ|Ⓢ|Ⓖ|Ⓥ|Ⓞ)/g, " ").trim(),
                  logo: item.tvg && item.tvg.logo && item.tvg.logo.indexOf("http") == 0 ? item.tvg.logo : null,
                  group: item.group.title,
                  url: item.url,
                  catchup: item.catchup,
                  timeshift: item.timeshift,
                  tvg: item.tvg
                };
                if (!item.catchup.type && catchup && item.raw.indexOf('catchup-enable="1"') >= 0) {
                  channel.catchup = catchup;
                }
                channels.push(channel);
              }
              let result = {
                menu: [],
                channels
              };
              result.menu.push({
                name: "",
                count: channels.length
              });
              for (let i = 0; i < channels.length; i++) {
                let channel = channels[i];
                let group = channel.group;
                let find = result.menu.find((item) => item.name === group);
                if (find) {
                  find.count++;
                } else {
                  result.menu.push({
                    name: group,
                    count: 1
                  });
                }
              }
              resolve({
                name: "",
                playlist: result,
                secuses: true
              });
            } else {
              reject(Lampa.Lang.translate("torrent_parser_empty") + " [M3UClient Function (Parsing m3u failed)]");
            }
          }, (e) => {
            e.from_error = "M3UClient Function (Failed to load)";
            reject(e);
          }, false, {
            dataType: "text"
          });
        });
      }
      static playlist(data) {
        let id = data.id;
        if (id === "cubpro_hd_builtin" || data.builtin || data.url && data.url.indexOf("builtin://") === 0) {
          return Promise.resolve(this.builtinPlaylistData());
        }
        return new Promise((resolve, reject) => {
          Promise.all([
            DB.getDataAnyCase("playlist", id),
            Params.get(id)
          ]).then((result) => {
            let playlist = result[0];
            let params = result[1];
            if (playlist && params) {
              let time = {
                "always": 0,
                "hour": 1e3 * 60 * 60,
                "hour12": 1e3 * 60 * 60 * 12,
                "day": 1e3 * 60 * 60 * 24,
                "week": 1e3 * 60 * 60 * 24 * 7,
                "none": 0
              };
              if (params.update_time + time[params.update] > Date.now() || params.update == "none") return resolve(playlist);
            }
            let secuses = (result2) => {
              DB.rewriteData("playlist", id, result2).finally(() => {
                if (params) params.update_time = Date.now();
                Params.set(id, params).finally(resolve.bind(resolve, result2));
              });
            };
            let error = (e) => {
              playlist ? resolve(playlist) : reject(e);
            };
            this.m3uClient(data.url).then(secuses).catch(error);
          }).catch((e) => {
            e.from_error = "Playlist Function (Something went wrong)";
            reject(e);
          });
        });
      }
      static program(data) {
        return new Promise((resolve) => {
          let days = Lampa.Storage.field("iptv_guide_custom") ? Lampa.Storage.field("iptv_guide_save") : 3;
          let tvg_id = data.tvg && data.tvg.id ? data.tvg.id : data.channel_id;
          let tvg_name = data.tvg && data.tvg.name ? data.tvg.name : "";
          let loadCUB = () => {
            resolve([]);
          };
          let loadEPG = (id, call) => {
            DB.getDataAnyCase("epg", id, 60 * 24 * days).then((epg) => {
              if (epg) resolve(epg);
              else call();
            }).catch(call);
          };
          if (tvg_id) {
            loadEPG(tvg_id, () => {
              DB.getDataAnyCase("epg_channels", (tvg_name || data.name).toLowerCase()).then((gu) => {
                if (gu) loadEPG(gu.id, loadCUB);
                else loadCUB();
              }).catch(loadCUB);
            });
          } else resolve([]);
        });
      }
    }
    __publicField$1(Api, "network", new Lampa.Reguest());
    __publicField$1(Api, "api_url", Lampa.Utils.protocol() + Lampa.Manifest.cub_domain + "/api/iptv/");

    class Pilot {
      static notebook(param_name, param_set) {
        let book = Lampa.Storage.get("iptv_pilot_book", "{}");
        Lampa.Arrays.extend(book, {
          playlist: "",
          channel: -1,
          category: ""
        });
        if (typeof param_set !== "undefined") {
          book[param_name] = param_set;
          Lampa.Storage.set("iptv_pilot_book", book);
        } else return book[param_name];
      }
    }

    class PlaylistItem {
      constructor(playlist) {
        this.playlist = playlist;
        this.item = Lampa.Template.js("cub_iptv_playlist_item");
        this.footer = this.item.find(".iptv-playlist-item__footer");
        this.params = {};
        Params.get(playlist.id).then((params) => {
          this.params = params;
          this.drawFooter();
        });
        let name = playlist.name || "---";
        this.item.find(".iptv-playlist-item__url").text(playlist.url);
        this.item.find(".iptv-playlist-item__name-text").text(name);
        this.item.find(".iptv-playlist-item__name-ico span").text(name.slice(0, 1).toUpperCase());
        this.item.on("hover:long", this.displaySettings.bind(this)).on("hover:enter", () => {
          if (this.deleted) return;
          Pilot.notebook("playlist", playlist.id);
          DB.rewriteData("playlist", "active", playlist.id).finally(() => {
            this.listener.send("channels-load", playlist);
          });
        });
        this.item.on("update", () => {
          Params.get(playlist.id).then((params) => {
            this.params = params;
            this.drawFooter();
          });
        });
      }
      displaySettings() {
        if (this.deleted) return;
        let params = {
          update: ["always", "hour", "hour12", "day", "week", "none"],
          loading: ["cub", "lampa"]
        };
        let menu = [];
        menu = menu.concat([
          {
            title: Lampa.Lang.translate("iptv_update"),
            subtitle: Params.value(this.params, "update"),
            name: "update"
          },
          {
            title: Lampa.Lang.translate("iptv_loading"),
            subtitle: Params.value(this.params, "loading"),
            name: "loading"
          },
          {
            title: Lampa.Lang.translate("iptv_remove_cache"),
            subtitle: Lampa.Lang.translate("iptv_remove_cache_descr")
          }
        ]);
        if (this.playlist.custom) {
          menu = menu.concat([
            {
              title: Lampa.Lang.translate("more"),
              separator: true
            },
            {
              title: Lampa.Lang.translate("iptv_playlist_change_name"),
              name: "change",
              value: "name"
            },
            {
              title: Lampa.Lang.translate("extensions_change_link"),
              name: "change",
              value: "url"
            },
            {
              title: Lampa.Lang.translate("extensions_remove"),
              name: "delete"
            }
          ]);
        }
        Lampa.Select.show({
          title: Lampa.Lang.translate("title_settings"),
          items: menu,
          onSelect: (a) => {
            if (a.name == "change") {
              Lampa.Input.edit({
                title: Lampa.Lang.translate("iptv_playlist_add_set_" + a.value),
                free: true,
                nosave: true,
                value: this.playlist[a.value]
              }, (value) => {
                if (value) {
                  let list = Lampa.Storage.get("iptv_playlist_custom", "[]");
                  let item = list.find((n) => n.id == this.playlist.id);
                  if (item && item[a.value] !== value) {
                    item[a.value] = value;
                    this.playlist[a.value] = value;
                    Lampa.Storage.set("iptv_playlist_custom", list);
                    this.item.find(".iptv-playlist-item__" + (a.value == "name" ? "name-text" : "url")).text(value);
                    Lampa.Noty.show(Lampa.Lang.translate("iptv_playlist_" + a.value + "_changed"));
                  }
                }
                Lampa.Controller.toggle("content");
              });
            } else if (a.name == "delete") {
              Lampa.Modal.open({
                title: "",
                align: "center",
                html: $('<div class="about">' + Lampa.Lang.translate("iptv_confirm_delete_playlist") + "</div>"),
                buttons: [
                  {
                    name: Lampa.Lang.translate("settings_param_no"),
                    onSelect: () => {
                      Lampa.Modal.close();
                      Lampa.Controller.toggle("content");
                    }
                  },
                  {
                    name: Lampa.Lang.translate("settings_param_yes"),
                    onSelect: () => {
                      let list = Lampa.Storage.get("iptv_playlist_custom", "[]");
                      Lampa.Arrays.remove(list, list.find((n) => n.id == this.playlist.id));
                      Lampa.Storage.set("iptv_playlist_custom", list);
                      Lampa.Noty.show(Lampa.Lang.translate("iptv_playlist_deleted"));
                      Lampa.Modal.close();
                      Lampa.Controller.toggle("content");
                      this.item.style.opacity = 0.3;
                      this.deleted = true;
                    }
                  }
                ]
              });
            } else if (a.name) {
              let keys = params[a.name];
              let items = [];
              keys.forEach((k) => {
                items.push({
                  title: Lampa.Lang.translate("iptv_params_" + k),
                  selected: this.params[a.name] == k,
                  value: k
                });
              });
              Lampa.Select.show({
                title: Lampa.Lang.translate("title_settings"),
                items,
                onSelect: (b) => {
                  this.params[a.name] = b.value;
                  Params.set(this.playlist.id, this.params).then(this.drawFooter.bind(this)).catch((e) => {
                    Lampa.Noty.show(e);
                  }).finally(this.displaySettings.bind(this));
                },
                onBack: this.displaySettings.bind(this)
              });
            } else {
              DB.deleteData("playlist", this.playlist.id).finally(() => {
                Lampa.Noty.show(Lampa.Lang.translate("iptv_cache_clear"));
              });
              Lampa.Controller.toggle("content");
            }
          },
          onBack: () => {
            Lampa.Controller.toggle("content");
          }
        });
      }
      drawFooter() {
        this.footer.removeClass("hide");
        function label(where, name, value) {
          let leb_div = document.createElement("div");
          let leb_val = document.createElement("span");
          leb_div.addClass("iptv-playlist-item__label");
          if (name) leb_div.text(name + " - ");
          leb_val.text(value);
          leb_div.append(leb_val);
          where.append(leb_div);
        }
        DB.getDataAnyCase("playlist", "active").then((active) => {
          let details_left = this.item.find(".details-left").empty();
          let details_right = this.item.find(".details-right").empty();
          if (active && active == this.playlist.id) label(details_left, "", Lampa.Lang.translate("iptv_active"));
          label(details_left, Lampa.Lang.translate("iptv_update"), Params.value(this.params, "update"));
          label(details_left, Lampa.Lang.translate("iptv_loading"), Params.value(this.params, "loading"));
          label(details_right, Lampa.Lang.translate("iptv_updated"), Lampa.Utils.parseTime(this.params.update_time).briefly);
        });
      }
      render() {
        return this.item;
      }
    }

    class Playlist {
      constructor(listener) {
        this.listener = listener;
        this.html = Lampa.Template.js("cub_iptv_list");
        this.scroll = new Lampa.Scroll({ mask: true, over: true });
        this.html.find(".iptv-list__title").text(Lampa.Lang.translate("iptv_select_playlist"));
        this.html.find(".iptv-list__items").append(this.scroll.render(true));
      }
      item(data) {
        let item = new PlaylistItem(data);
        item.listener = this.listener;
        let elem = item.render();
        elem.on("hover:focus", () => {
          this.last = elem;
          this.scroll.update(this.last);
        }).on("hover:hover hover:touch", () => {
          this.last = elem;
          Navigator.focused(elem);
        });
        return item;
      }
      list(playlist) {
        this.scroll.clear();
        this.scroll.reset();
        this.html.find(".iptv-list__text").html(Lampa.Lang.translate("iptv_select_playlist_text"));
        let add = Lampa.Template.js("cub_iptv_list_add_custom");
        add.find(".iptv-playlist-item__title").text(Lampa.Lang.translate("iptv_playlist_add_new"));
        add.on("hover:enter", () => {
          Lampa.Input.edit({
            title: Lampa.Lang.translate("iptv_playlist_add_set_url"),
            free: true,
            nosave: true,
            value: ""
          }, (value) => {
            if (value) {
              let data = {
                id: Lampa.Utils.uid(),
                custom: true,
                url: value,
                name: ""
              };
              Lampa.Storage.add("iptv_playlist_custom", data);
              let item = this.item(data);
              add.parentNode.insertBefore(item.render(), add.nextSibling);
            }
            Lampa.Controller.toggle("content");
          });
        });
        add.on("hover:focus", () => {
          this.last = add;
          this.scroll.update(this.last);
        });
        this.scroll.append(add);
        playlist.list.reverse().forEach((data) => {
          let item = this.item(data);
          this.scroll.append(item.render());
        });
        this.listener.send("display", this);
      }
      main() {
        Api.list().then(this.list.bind(this)).catch(this.empty.bind(this));
      }
      load() {
        Promise.all([
          Api.list(),
          DB.getDataAnyCase("playlist", "active")
        ]).then((result) => {
          let playlist = result[0];
          let active = result[1] || Pilot.notebook("playlist");
          if (playlist) {
            if (active) {
              let find = playlist.list.find((l) => l.id == active);
              if (find) {
                this.listener.send("channels-load", find);
              } else this.list(playlist);
            } else this.list(playlist);
          } else this.empty();
        }).catch(this.empty.bind(this));
      }
      empty() {
        this.scroll.clear();
        this.scroll.reset();
        this.html.find(".iptv-list__text").html(Lampa.Lang.translate("iptv_playlist_empty"));
        let empty = Lampa.Template.js("cub_iptv_list_empty");
        empty.find(".iptv-list-empty__text").html(Lampa.Lang.translate("empty_title"));
        this.scroll.append(empty);
        this.listener.send("display", this);
      }
      toggle() {
        Lampa.Controller.add("content", {
          toggle: () => {
            Lampa.Controller.collectionSet(this.html);
            Lampa.Controller.collectionFocus(this.last, this.html);
          },
          left: () => {
            Lampa.Controller.toggle("menu");
          },
          down: Navigator.move.bind(Navigator, "down"),
          up: () => {
            if (Navigator.canmove("up")) Navigator.move("up");
            else Lampa.Controller.toggle("head");
          },
          back: () => {
            Lampa.Activity.backward();
          }
        });
        Lampa.Controller.toggle("content");
      }
      render() {
        return this.html;
      }
      destroy() {
        this.scroll.destroy();
        this.html.remove();
      }
    }

    class Icons {
      constructor(listener) {
        this.listener = listener;
        this.position = 0;
        this.scroll = new Lampa.Scroll({ mask: !window.iptv_mobile, over: true, end_ratio: 2, horizontal: window.iptv_mobile });
        this.html = document.createElement("div");
        this.html.addClass("iptv-channels");
        this.scroll.append(this.html);
        if (!window.iptv_mobile) this.scroll.minus();
        this.scroll.onEnd = () => {
          this.position++;
          this.next();
        };
        this.listener.follow("icons-load", (data) => {
          this.icons = data.icons;
          if (data.menu.favorites) {
            this.icons.sort((a, b) => {
              let ta = a.added || 0;
              let tb = b.added || 0;
              return ta < tb ? -1 : ta > tb ? 1 : 0;
            });
            this.sort();
          }
          this.icons_clone = Lampa.Arrays.clone(this.icons);
          this.html.empty();
          this.scroll.reset();
          this.position = 0;
          this.last = false;
          this.next();
          let channel = Pilot.notebook("channel");
          if (channel >= 0 && channel <= this.icons.length && window.lampa_settings.iptv) {
            setTimeout(() => {
              this.listener.send("play", {
                position: channel,
                total: this.icons.length
              });
            }, 1e3);
          }
        });
      }
      sort() {
        let sort_type = Lampa.Storage.field("iptv_favotite_sort");
        if (Lampa.Account.hasPremium() && sort_type !== "add") {
          this.icons.sort((a, b) => {
            if (sort_type == "name") {
              return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
            } else if (sort_type == "view") {
              let va = a.view || 0;
              let vb = b.view || 0;
              return va < vb ? 1 : va > vb ? -1 : 0;
            }
          });
        }
      }
      active(item) {
        let active = this.html.find(".active");
        if (active) active.removeClass("active");
        item.addClass("active");
      }
      icon(item, element) {
        let icons = item.find(".iptv-channel__icons");
        icons.empty();
        if (Favorites.find(element)) icons.append(Lampa.Template.js("cub_iptv_icon_fav"));
        if (Locked.find(Locked.format("channel", element))) icons.append(Lampa.Template.js("cub_iptv_icon_lock"));
      }
      next() {
        let views = 10;
        let start = this.position * views;
        this.icons.slice(start, start + views).forEach((element, index) => {
          delete element.target;
          let item = document.createElement("div");
          let body = document.createElement("div");
          let img = document.createElement("img");
          let chn = document.createElement("div");
          let icn = document.createElement("div");
          let position = start + index;
          chn.text((position + 1).pad(3));
          item.addClass("iptv-channel selector layer--visible layer--render");
          body.addClass("iptv-channel__body");
          img.addClass("iptv-channel__ico");
          chn.addClass("iptv-channel__chn");
          icn.addClass("iptv-channel__icons");
          body.append(img);
          item.append(body);
          item.append(chn);
          item.append(icn);
          this.icon(item, element);
          this.listener.follow("update-channel-icon", (channel) => {
            if (channel.name == element.name) this.icon(item, element);
          });
          item.on("visible", () => {
            img.onerror = () => {
              let simb = document.createElement("div");
              simb.addClass("iptv-channel__simb");
              simb.text(element.name.length <= 3 ? element.name.toUpperCase() : element.name.replace(/[^a-z|а-я|0-9]/gi, "").toUpperCase()[0]);
              let text = document.createElement("div");
              text.addClass("iptv-channel__name");
              text.text(Utils.clear(element.name));
              body.append(simb);
              body.append(text);
            };
            img.onload = function() {
              item.addClass("loaded");
              if (element.logo.indexOf("epg.it999") == -1) {
                item.addClass("small--icon");
              }
            };
            if (element.logo) img.src = element.logo;
            else img.onerror();
          });
          item.on("hover:focus", () => {
            this.active(item);
            this.scroll.update(item);
            if (this.last !== item) this.listener.send("details-load", element);
            this.last = item;
          }).on("hover:hover hover:touch", () => {
            Navigator.focused(item);
            this.active(item);
            if (this.last !== item) this.listener.send("details-load", element);
            this.last = item;
          }).on("hover:long", () => {
            Lampa.Select.show({
              title: Lampa.Lang.translate("title_action"),
              items: [
                {
                  title: Lampa.Lang.translate(Favorites.find(element) ? "iptv_remove_fav" : "iptv_add_fav"),
                  type: "favorite"
                },
                {
                  title: Lampa.Lang.translate(Locked.find(Locked.format("channel", element)) ? "iptv_channel_unlock" : "iptv_channel_lock"),
                  type: "locked"
                }
              ],
              onSelect: (a) => {
                this.toggle();
                if (a.type == "favorite") {
                  Favorites.toggle(element).finally(() => {
                    this.icon(item, element);
                    this.listener.send("update-favorites");
                  });
                } else if (a.type == "locked") {
                  if (Lampa.Manifest.app_digital >= 204) {
                    if (Locked.find(Locked.format("channel", element))) {
                      Lampa.ParentalControl.query(() => {
                        this.toggle();
                        Locked.remove(Locked.format("channel", element)).finally(() => {
                          this.icon(item, element);
                        });
                      }, this.toggle.bind(this));
                    } else {
                      Locked.add(Locked.format("channel", element)).finally(() => {
                        this.icon(item, element);
                      });
                    }
                  } else {
                    Lampa.Noty.show(Lampa.Lang.translate("iptv_need_update_app"));
                  }
                }
              },
              onBack: this.toggle.bind(this)
            });
          }).on("hover:enter", () => {
            this.listener.send("play", {
              position,
              total: this.icons.length
            });
          });
          this.html.append(item);
          if (Lampa.Controller.own(this)) Lampa.Controller.collectionAppend(item);
        });
        setTimeout(() => {
          Lampa.Layer.visible(this.html);
        }, 300);
      }
      toggle() {
        Lampa.Controller.add("content", {
          link: this,
          toggle: () => {
            if (this.html.find(".selector")) {
              Lampa.Controller.collectionSet(this.html);
              Lampa.Controller.collectionFocus(this.last, this.html);
            } else this.listener.send("toggle", "menu");
          },
          left: () => {
            this.listener.send("toggle", "menu");
          },
          right: () => {
            this.listener.send("toggle", "details");
          },
          up: () => {
            if (Navigator.canmove("up")) Navigator.move("up");
            else Lampa.Controller.toggle("head");
          },
          down: () => {
            if (Navigator.canmove("down")) Navigator.move("down");
          },
          back: () => {
            this.listener.send("back");
          }
        });
        Lampa.Controller.toggle("content");
      }
      render() {
        return this.scroll.render(true);
      }
      destroy() {
        this.scroll.destroy();
        this.html.remove();
      }
    }

    var __defProp = Object.defineProperty;
    var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
    class EPG {
      static init() {
        let ts = (/* @__PURE__ */ new Date()).getTime();
        Api.time((json) => {
          let te = (/* @__PURE__ */ new Date()).getTime();
          this.time_offset = json.time < ts || json.time > te ? json.time - te : 0;
        });
      }
      static time(channel, timeshift = 0) {
        let date = /* @__PURE__ */ new Date(), time = date.getTime() + this.time_offset, ofst = parseInt((localStorage.getItem("time_offset") == null ? "n0" : localStorage.getItem("time_offset")).replace("n", ""));
        date = new Date(time + ofst * 1e3 * 60 * 60);
        let offset = channel.name.match(/([+|-]\d)$/);
        if (offset) {
          date.setHours(date.getHours() + parseInt(offset[1]));
        }
        let result = date.getTime();
        result -= timeshift;
        return result;
      }
      static position(channel, list, timeshift) {
        let tim = this.time(channel, timeshift);
        let now = list.find((p) => tim > p.start && tim < p.stop);
        return now ? list.indexOf(now) : list.length - 1;
      }
      static timeline(channel, program, timeshift) {
        let time = this.time(channel, timeshift);
        let total = program.stop - program.start;
        let less = program.stop - time;
        return Math.min(100, Math.max(0, (1 - less / total) * 100));
      }
      static list(channel, list, size = 10, position = 0) {
        let day_lst = "";
        let day_prg = "";
        let day_now = new Date(Date.now()).getDate();
        let day_nam = {};
        let display = [];
        day_nam[day_now - 1] = Lampa.Lang.translate("iptv_yesterday");
        day_nam[day_now] = Lampa.Lang.translate("iptv_today");
        day_nam[day_now + 1] = Lampa.Lang.translate("iptv_tomorrow");
        let watch = list[this.position(channel, list)];
        list.slice(position, position + size).forEach((elem) => {
          day_prg = new Date(elem.start).getDate();
          if (day_lst !== day_prg) {
            day_lst = day_prg;
            display.push({
              type: "date",
              date: day_nam[day_prg] ? day_nam[day_prg] : Lampa.Utils.parseTime(elem.start).short
            });
          }
          display.push({
            type: "program",
            program: elem,
            watch: watch == elem
          });
        });
        return display;
      }
    }
    __publicField(EPG, "time_offset", 0);

    class Details {
      constructor(listener) {
        this.listener = listener;
        this.html = Lampa.Template.js("cub_iptv_details");
        this.title = this.html.find(".iptv-details__title");
        this.play = this.html.find(".iptv-details__play");
        this.progm = this.html.find(".iptv-details__program");
        this.progm_image = false;
        this.empty_html = Lampa.Template.js("cub_iptv_details_empty");
        this.listener.follow("details-load", this.draw.bind(this));
        if (window.iptv_mobile) this.html.removeClass("layer--wheight");
        this.timer = setInterval(() => {
          if (this.timeline) this.timeline();
        }, 1e3 * 5);
      }
      draw(channel) {
        this.title.text(Utils.clearChannelName(channel.name));
        this.group(channel, Utils.clearMenuName(channel.group || Lampa.Lang.translate("player_unknown")));
        this.wait_for = channel.name;
        if (channel.id) {
          this.progm.text(Lampa.Lang.translate("loading") + "...");
          Api.program({
            name: channel.name,
            channel_id: channel.id,
            time: EPG.time(channel),
            tvg: channel.tvg
          }).then((program) => {
            if (this.wait_for == channel.name) {
              if (program.length) this.program(channel, program);
              else this.empty();
            }
          }).catch((e) => {
            this.empty();
          });
        } else {
          this.empty();
        }
      }
      group(channel, title) {
        this.play.empty();
        let group = document.createElement("span");
        group.text(title);
        if (Utils.hasArchive(channel)) {
          let archive = document.createElement("span");
          archive.addClass("lb").text("A");
          this.play.append(archive);
        }
        let hd = Utils.isHD(channel.name);
        if (hd) {
          let hd_lb = document.createElement("span");
          hd_lb.addClass("lb").text(hd.toUpperCase());
          this.play.append(hd_lb);
        }
        this.play.append(group);
      }
      empty() {
        this.timeline = false;
        this.progm.empty().append(this.empty_html);
      }
      buildProgramList(channel, program, params) {
        let stime = EPG.time(channel);
        let start = EPG.position(channel, program);
        let archive = Utils.hasArchive(channel);
        if (!params && program[start]) {
          this.group(channel, Lampa.Utils.shortText(Utils.clear(program[start].title), 50));
        }
        return new Lampa.Endless((position) => {
          if (position >= program.length) return this.endless.to(position - 1);
          let wrap = document.createElement("div");
          let list = EPG.list(channel, program, 10, position);
          wrap.addClass("iptv-details__list");
          list.forEach((elem, index) => {
            let item = document.createElement("div");
            if (elem.type == "date") item.addClass("iptv-program-date").text(elem.date);
            else {
              item.addClass("iptv-program selector");
              let head, icon_wrap, icon_img, head_body;
              let time = document.createElement("div");
              time.addClass("iptv-program__time").text(Lampa.Utils.parseTime(elem.program.start).time);
              let body = document.createElement("div");
              body.addClass("iptv-program__body");
              let title = document.createElement("div");
              title.addClass("iptv-program__title").text(Utils.clear(elem.program.title));
              if (elem.program.icon && index == 1) {
                head = document.createElement("div");
                head_body = document.createElement("div");
                icon_wrap = document.createElement("div");
                icon_img = document.createElement("img");
                head.addClass("iptv-program__head");
                head_body.addClass("iptv-program__head-body");
                icon_wrap.addClass("iptv-program__icon-wrap");
                icon_img.addClass("iptv-program__icon-img");
                icon_wrap.append(icon_img);
                head.append(icon_wrap);
                head.append(head_body);
                head_body.append(title);
                body.append(head);
                if (this.progm_image && this.progm_image.waiting) this.progm_image.src = "";
                icon_img.onload = () => {
                  icon_img.waiting = false;
                  icon_wrap.addClass("loaded");
                };
                icon_img.error = () => {
                  icon_wrap.addClass("loaded-error");
                  icon_img.src = "./img/img_broken.svg";
                };
                icon_img.waiting = true;
                icon_img.src = elem.program.icon;
                this.progm_image = icon_img;
              } else {
                body.append(title);
              }
              if (elem.watch) {
                let timeline = document.createElement("div");
                timeline.addClass("iptv-program__timeline");
                let div = document.createElement("div");
                div.style.width = EPG.timeline(channel, elem.program) + "%";
                timeline.append(div);
                if (!params) {
                  this.timeline = () => {
                    let percent = EPG.timeline(channel, elem.program);
                    div.style.width = percent + "%";
                    if (percent == 100) {
                      let next = EPG.position(channel, program);
                      if (start !== next) this.program(channel, program);
                    }
                  };
                }
                if (archive) {
                  item.on("hover:enter", () => {
                    let data = {
                      program: elem.program,
                      position,
                      channel,
                      playlist: program.slice(Math.max(0, position - 40), start)
                    };
                    if (params) params.onPlay(data);
                    else this.listener.send("play-archive", data);
                  });
                }
                item.addClass("played");
                if (elem.program.icon && head_body) {
                  head_body.append(timeline);
                } else {
                  body.append(timeline);
                }
              }
              if (index == 1 && elem.program.desc) {
                let text = Utils.clear(elem.program.desc);
                if (text.length > 300) text = text.slice(0, 300) + "...";
                let descr = document.createElement("div");
                descr.addClass("iptv-program__descr").text(text);
                body.append(descr);
              }
              if (archive) {
                let minus = stime - archive * 1e3 * 60 * 60 * 24;
                if (elem.program.start > minus && elem.program.stop < stime) {
                  item.addClass("archive");
                  item.on("hover:enter", () => {
                    let data = {
                      program: elem.program,
                      position,
                      channel,
                      timeshift: stime - elem.program.start,
                      playlist: program.slice(Math.max(0, position - 40), start)
                    };
                    if (params) params.onPlay(data);
                    else this.listener.send("play-archive", data);
                  });
                }
              }
              item.append(time);
              item.append(body);
            }
            wrap.append(item);
          });
          return wrap;
        }, { position: start });
      }
      /**
       * Программа в плеере
       */
      playlist(channel, program, params = {}) {
        return this.buildProgramList(channel, program, params);
      }
      /**
       * Программа в главном интерфейсе
       */
      program(channel, program) {
        if (this.endless) this.endless.destroy();
        this.timeline = false;
        this.endless = this.buildProgramList(channel, program);
        this.progm.empty().append(this.endless.render());
      }
      toggle() {
        Lampa.Controller.add("content", {
          link: this,
          toggle: () => {
            if (this.html.find(".selector")) {
              Lampa.Controller.collectionSet(this.html);
              Lampa.Controller.collectionFocus(false, this.html);
            } else this.listener.send("toggle", "icons");
          },
          left: () => {
            this.listener.send("toggle", "icons");
          },
          up: () => {
            if (this.endless) {
              this.endless.move(-1);
              Lampa.Controller.collectionSet(this.html);
              Lampa.Controller.collectionFocus(false, this.html);
            }
          },
          down: () => {
            if (this.endless) {
              this.endless.move(1);
              Lampa.Controller.collectionSet(this.html);
              Lampa.Controller.collectionFocus(false, this.html);
            }
          },
          back: () => {
            this.listener.send("back");
          }
        });
        Lampa.Controller.toggle("content");
      }
      render() {
        return this.html;
      }
      destroy() {
        this.html.remove();
        clearInterval(this.timer);
        this.wait_for = false;
      }
    }

    let last_query = "";
    class Search {
      static find(channels, call) {
        let controller = Lampa.Controller.enabled().name;
        Lampa.Input.edit({
          value: last_query,
          free: true,
          nosave: true
        }, (new_value) => {
          last_query = new_value;
          Lampa.Controller.toggle(controller);
          call({
            channels: channels.filter((c) => c.name.toLowerCase().indexOf(new_value.toLowerCase()) >= 0),
            query: new_value
          });
        });
      }
    }

    class Menu {
      constructor(listener) {
        this.listener = listener;
        this.html = Lampa.Template.js("cub_iptv_menu");
        this.menu = this.html.find(".iptv-menu__list");
        this.scroll = new Lampa.Scroll({ mask: !window.iptv_mobile, over: true, horizontal: window.iptv_mobile });
        if (!window.iptv_mobile) this.scroll.minus();
        this.scroll.append(this.html);
      }
      favorites(channels) {
        let favorites = Favorites.list();
        if (Lampa.Storage.get("iptv_favotite_save", "url") == "name") {
          favorites = favorites.filter((f) => {
            return channels.find((c) => c.name == f.name);
          });
          favorites.forEach((f) => {
            f.url = channels.find((c) => c.name == f.name).url;
          });
        }
        return favorites;
      }
      build(data) {
        this.menu.empty();
        let search_item = {
          name: Lampa.Lang.translate("search"),
          count: 0,
          search: true
        };
        this.html.find(".iptv-menu__title").text(data.name || Lampa.Lang.translate("player_playlist"));
        this.html.find(".iptv-menu__search").on("hover:enter", () => {
          Search.find(data.playlist.channels, search_item.update);
        });
        Lampa.Arrays.insert(data.playlist.menu, 0, search_item);
        let favorites = this.favorites(data.playlist.channels);
        let category = Pilot.notebook("category");
        Lampa.Arrays.insert(data.playlist.menu, 0, {
          name: Lampa.Lang.translate("settings_input_links"),
          count: favorites.length,
          favorites: true
        });
        let first;
        let first_item;
        let pilot;
        if (window.iptv_mobile) {
          let mobile_seacrh_button = Lampa.Template.js("iptv_menu_mobile_button_search");
          mobile_seacrh_button.on("hover:enter", () => {
            Search.find(data.playlist.channels, search_item.update);
          });
          this.menu.append(mobile_seacrh_button);
        }
        data.playlist.menu.forEach((menu) => {
          if (menu.count == 0 && !(menu.favorites || menu.search)) return;
          let li = document.createElement("div");
          let co = document.createElement("span");
          let nm = document.createElement("div");
          let ic = document.createElement("div");
          li.addClass("iptv-menu__list-item selector");
          ic.addClass("iptv-menu__list-item-icon");
          nm.text(Utils.clearMenuName(menu.name || Lampa.Lang.translate("iptv_all_channels")));
          co.text(menu.count);
          li.append(ic);
          li.append(nm);
          li.append(co);
          let icon_name = "group";
          if (menu.favorites) icon_name = "fav";
          if (menu.search) icon_name = "searched";
          if (!menu.name) icon_name = "all";
          ic.append(Lampa.Template.js("cub_iptv_icon_" + icon_name));
          if (menu.favorites) {
            li.addClass("favorites--menu-item");
            this.listener.follow("update-favorites", () => {
              favorites = Favorites.list();
              menu.count = favorites.length;
              co.text(menu.count);
            });
          } else if (menu.search) {
            li.addClass("search--menu-item");
            menu.update = (result) => {
              menu.find = result.channels;
              menu.count = result.channels.length;
              co.text(result.channels.length);
              if (menu.count) Lampa.Utils.trigger(li, "hover:enter");
              else {
                Lampa.Noty.show(Lampa.Lang.translate("iptv_search_no_result") + " (" + result.query + ")");
                if (first_item) Lampa.Utils.trigger(first_item, "hover:enter");
              }
            };
          } else {
            if (!first_item) {
              first_item = li;
            }
            if (menu.name) {
              let updateIcon = () => {
                ic.empty();
                ic.append(Lampa.Template.js("cub_iptv_icon_" + (Locked.find(Locked.format("group", menu.name)) ? "lock" : "group")));
              };
              updateIcon();
              li.on("hover:long", () => {
                Lampa.Select.show({
                  title: Lampa.Lang.translate("title_action"),
                  items: [
                    {
                      title: Lampa.Lang.translate(Locked.find(Locked.format("group", menu.name)) ? "iptv_channel_unlock" : "iptv_channel_lock"),
                      type: "locked"
                    }
                  ],
                  onSelect: (a) => {
                    this.toggle();
                    if (a.type == "locked") {
                      if (Lampa.Manifest.app_digital >= 204) {
                        if (Locked.find(Locked.format("group", menu.name))) {
                          Lampa.ParentalControl.query(() => {
                            this.toggle();
                            Locked.remove(Locked.format("group", menu.name)).finally(updateIcon);
                          }, this.toggle.bind(this));
                        } else {
                          Locked.add(Locked.format("group", menu.name)).finally(updateIcon);
                        }
                      } else {
                        Lampa.Noty.show(Lampa.Lang.translate("iptv_need_update_app"));
                      }
                    }
                  },
                  onBack: this.toggle.bind(this)
                });
              });
            }
          }
          li.on("hover:enter", () => {
            if (menu.count == 0) return;
            let load = () => {
              Pilot.notebook("category", menu.name || "all");
              this.listener.send("icons-load", { menu, icons: menu.name ? data.playlist.channels.filter((a) => a.group == menu.name) : data.playlist.channels });
            };
            let toggle = () => {
              let active = this.menu.find(".active");
              if (active) active.removeClass("active");
              li.addClass("active");
              this.last = li;
              this.listener.send("toggle", "icons");
            };
            if (menu.favorites) {
              Pilot.notebook("category", "");
              this.listener.send("icons-load", { menu, icons: favorites });
            } else if (menu.search) {
              Pilot.notebook("category", "");
              this.listener.send("icons-load", { menu, icons: menu.find });
            } else {
              if (Lampa.Manifest.app_digital >= 204 && Locked.find(Locked.format("group", menu.name))) {
                return Lampa.ParentalControl.query(() => {
                  load();
                  toggle();
                }, this.toggle.bind(this));
              } else load();
            }
            toggle();
          });
          li.on("hover:focus", () => {
            this.scroll.update(li, true);
            this.last = li;
          });
          if (!first && menu.count !== 0) first = li;
          if (menu.name == category && category || !menu.name && category == "all") pilot = li;
          this.menu.append(li);
        });
        if (pilot) Lampa.Utils.trigger(pilot, "hover:enter");
        else if (first) Lampa.Utils.trigger(first, "hover:enter");
      }
      toggle() {
        Lampa.Controller.add("content", {
          toggle: () => {
            Lampa.Controller.collectionSet(this.html);
            Lampa.Controller.collectionFocus(this.last, this.html);
          },
          left: () => {
            Lampa.Controller.toggle("menu");
          },
          right: () => {
            this.listener.send("toggle", "icons");
          },
          up: () => {
            if (Navigator.canmove("up")) Navigator.move("up");
            else Lampa.Controller.toggle("head");
          },
          down: () => {
            if (Navigator.canmove("down")) Navigator.move("down");
          },
          back: () => {
            this.listener.send("back");
          }
        });
        Lampa.Controller.toggle("content");
      }
      render() {
        return this.scroll.render(true);
      }
      destroy() {
        this.scroll.destroy();
        this.html.remove();
      }
    }

    function strReplace(str, key2val) {
      for (let key in key2val) {
        str = str.replace(
          new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          key2val[key]
        );
      }
      return str;
    }
    function tf(t, format, u, tz) {
      format = format || "";
      tz = parseInt(tz || "0");
      var thisOffset = EPG.time_offset;
      thisOffset += tz;
      if (!u) thisOffset += parseInt(Lampa.Storage.get("time_offset", "n0").replace("n", "")) * 60 - (/* @__PURE__ */ new Date()).getTimezoneOffset();
      var d = new Date((t + thisOffset) * 1e3);
      var r = { yyyy: d.getUTCFullYear(), MM: ("0" + (d.getUTCMonth() + 1)).substr(-2), dd: ("0" + d.getUTCDate()).substr(-2), HH: ("0" + d.getUTCHours()).substr(-2), mm: ("0" + d.getUTCMinutes()).substr(-2), ss: ("0" + d.getUTCSeconds()).substr(-2), UTF: t };
      return strReplace(format, r);
    }
    function unixtime$1() {
      return Math.floor(((/* @__PURE__ */ new Date()).getTime() + EPG.time_offset) / 1e3);
    }
    class Url {
      static prepareUrl(url, program) {
        let m = [], val = "", r = { start: unixtime$1, offset: 0 };
        if (program) {
          let start = Math.floor(program.start / 1e3);
          let end = Math.floor(program.stop / 1e3);
          let duration = end - start;
          r = {
            start,
            utc: start,
            end,
            utcend: end,
            offset: unixtime$1() - start,
            duration,
            durationfs: end > unixtime$1() ? "now" : duration,
            now: unixtime$1,
            lutc: unixtime$1,
            timestamp: unixtime$1,
            d: function(m2) {
              return strReplace(m2[6] || "", { M: Math.floor(duration / 60), S: duration, h: Math.floor(duration / 60 / 60), m: ("0" + Math.floor(duration / 60) % 60).substr(-2), s: "00" });
            },
            b: function(m2) {
              return tf(start, m2[6], m2[4], m2[5]);
            },
            e: function(m2) {
              return tf(end, m2[6], m2[4], m2[5]);
            },
            n: function(m2) {
              return tf(unixtime$1(), m2[6], m2[4], m2[5]);
            }
          };
        }
        while (!!(m = url.match(/\${(\((([a-zA-Z\d]+?)(u)?)([+-]\d+)?\))?([^${}]+)}/))) {
          if (!!m[2] && typeof r[m[2]] === "function") val = r[m[2]](m);
          else if (!!m[3] && typeof r[m[3]] === "function") val = r[m[3]](m);
          else if (m[6] in r) val = typeof r[m[6]] === "function" ? r[m[6]]() : r[m[6]];
          else val = m[1];
          url = url.replace(m[0], encodeURIComponent(val));
        }
        return url;
      }
      static catchupUrl(url, type, source) {
        type = (type || "").toLowerCase();
        source = source || "";
        if (!type) {
          if (!!source) {
            if (source.search(/^https?:\/\//i) === 0) type = "default";
            else if (source.search(/^[?&/][^/]/) === 0) type = "append";
            else type = "default";
          } else if (url.indexOf("${") < 0) type = "shift";
          else type = "default";
          console.log("IPTV", 'Autodetect catchup-type "' + type + '"');
        }
        var newUrl = "";
        switch (type) {
          case "append":
            if (source) {
              newUrl = (source.search(/^https?:\/\//i) === 0 ? "" : url) + source;
              break;
            }
          case "timeshift":
          // @deprecated
          case "shift":
            newUrl = source || url;
            newUrl += (newUrl.indexOf("?") >= 0 ? "&" : "?") + "utc=${start}&lutc=${timestamp}";
            return newUrl;
          case "flussonic":
          case "flussonic-hls":
          case "flussonic-ts":
          case "fs":
            return url.replace(/\/(video\d*|mono\d*)\.(m3u8|ts)(\?|$)/, "/$1-${start}-${durationfs}.$2$3").replace(/\/(index|playlist)\.(m3u8|ts)(\?|$)/, "/archive-${start}-${durationfs}.$2$3").replace(/\/mpegts(\?|$)/, "/timeshift_abs-${start}.ts$1").replace(/\/live(\?|$)/, "/${start}.ts$1");
          case "xc":
            newUrl = url.replace(
              /^(https?:\/\/[^/]+)(\/live)?(\/[^/]+\/[^/]+\/)([^/.]+)\.m3u8?$/,
              "$1/timeshift$3${(d)M}/${(b)yyyy-MM-dd:HH-mm}/$4.m3u8"
            ).replace(
              /^(https?:\/\/[^/]+)(\/live)?(\/[^/]+\/[^/]+\/)([^/.]+)(\.ts|)$/,
              "$1/timeshift$3${(d)M}/${(b)yyyy-MM-dd:HH-mm}/$4.ts"
            );
            break;
          case "default":
            newUrl = source || url;
            break;
          case "disabled":
            return false;
          default:
            console.log("IPTV", 'Err: no support catchup-type="' + type + '"');
            return false;
        }
        if (newUrl.indexOf("${") < 0) return this.catchupUrl(newUrl, "shift");
        return newUrl;
      }
    }

    class HUDMenu {
      constructor(listener, channel) {
        this.listener = listener;
        this.channel = channel;
        this.original = channel.original;
        this.html = document.createElement("div");
      }
      create() {
        let info = $(`
            <div class="iptv-hud-menu-info">
                <div class="iptv-hud-menu-info__group">${this.channel.group}</div>
                <div class="iptv-hud-menu-info__name">${this.channel.name}</div>
            </div>
        `)[0];
        let favorite = this.button(Lampa.Template.get("cub_iptv_icon_favorite", {}, true), Lampa.Lang.translate("settings_input_links"), () => {
          Favorites.toggle(this.original).finally(() => {
            favorite.toggleClass("active", Boolean(Favorites.find(this.original)));
            this.listener.send("action-favorite", this.original);
          });
        });
        let locked = this.button(Lampa.Template.get("cub_iptv_icon_lock", {}, true), Lampa.Lang.translate(Locked.find(Locked.format("channel", this.original)) ? "iptv_channel_unlock" : "iptv_channel_lock"), () => {
          let name = Lampa.Controller.enabled().name;
          if (Lampa.Manifest.app_digital >= 204) {
            if (Locked.find(Locked.format("channel", this.original))) {
              Lampa.ParentalControl.query(() => {
                Lampa.Controller.toggle(name);
                Locked.remove(Locked.format("channel", this.original)).finally(() => {
                  locked.toggleClass("active", Boolean(Locked.find(Locked.format("channel", this.original))));
                  this.listener.send("action-locked", this.original);
                });
              }, () => {
                Lampa.Controller.toggle(name);
              });
            } else {
              Locked.add(Locked.format("channel", this.original)).finally(() => {
                locked.toggleClass("active", Boolean(Locked.find(Locked.format("channel", this.original))));
                this.listener.send("action-locked", this.original);
              });
            }
          } else {
            Lampa.Noty.show(Lampa.Lang.translate("iptv_need_update_app"));
          }
        });
        favorite.toggleClass("active", Boolean(Favorites.find(this.original)));
        locked.toggleClass("active", Boolean(Locked.find(Locked.format("channel", this.original))));
        this.html.append(info);
        this.html.append(favorite);
        this.html.append(locked);
      }
      button(icon, text, call) {
        let button = $(`
            <div class="iptv-hud-menu-button selector">
                <div class="iptv-hud-menu-button__icon">${icon}</div>
                <div class="iptv-hud-menu-button__text">${text}</div>
            </div>
        `);
        button.on("hover:enter", call);
        return button[0];
      }
      toggle() {
        Lampa.Controller.add("player_iptv_hud_menu", {
          toggle: () => {
            Lampa.Controller.collectionSet(this.render());
            Lampa.Controller.collectionFocus(false, this.render());
          },
          up: () => {
            Navigator.move("up");
          },
          down: () => {
            Navigator.move("down");
          },
          right: () => {
            this.listener.send("toggle_program");
          },
          gone: () => {
            let focus = this.html.find(".focus");
            if (focus) focus.removeClass("focus");
          },
          back: () => {
            this.listener.send("close");
          }
        });
        Lampa.Controller.toggle("player_iptv_hud_menu");
      }
      render() {
        return this.html;
      }
      destroy() {
      }
    }

    class HUDProgram {
      constructor(listener, channel, program) {
        this.listener = listener;
        this.channel = channel;
        this.html = document.createElement("div");
      }
      create() {
        this.listener.follow("set_program_endless", (event) => {
          this.endless = event.endless;
          this.html.append(event.endless.render());
        });
        this.listener.send("get_program_endless");
      }
      toggle() {
        Lampa.Controller.add("player_iptv_hud_program", {
          toggle: () => {
            Lampa.Controller.collectionSet(this.render());
            Lampa.Controller.collectionFocus(false, this.render());
          },
          up: () => {
            this.endless.move(-1);
            Lampa.Controller.collectionSet(this.render());
            Lampa.Controller.collectionFocus(false, this.render());
          },
          down: () => {
            this.endless.move(1);
            Lampa.Controller.collectionSet(this.render());
            Lampa.Controller.collectionFocus(false, this.render());
          },
          left: () => {
            this.listener.send("toggle_menu");
          },
          gone: () => {
            let focus = this.html.find(".focus");
            if (focus) focus.removeClass("focus");
          },
          back: () => {
            this.listener.send("close");
          }
        });
        Lampa.Controller.toggle("player_iptv_hud_program");
      }
      render() {
        return this.html;
      }
      destroy() {
      }
    }

    class HUD {
      constructor(channel, program) {
        this.listener = Lampa.Subscribe();
        this.menu = new HUDMenu(this.listener, channel, program);
        this.program = new HUDProgram(this.listener, channel, program);
        this.hud = Lampa.Template.js("cub_iptv_hud");
        this.hud.find(".iptv-hud__menu").append(this.menu.render());
        this.hud.find(".iptv-hud__program").append(this.program.render());
        document.body.find(".player").append(this.hud);
        this.listen();
      }
      create() {
        this.menu.create();
        this.program.create();
        this.menu.toggle();
      }
      listen() {
        this.listener.follow("toggle_menu", () => {
          this.menu.toggle();
        });
        this.listener.follow("toggle_program", () => {
          this.program.toggle();
        });
      }
      destroy() {
        this.menu.destroy();
        this.program.destroy();
        this.hud.remove();
      }
    }

    class Channels {
      constructor(listener) {
        this.listener = listener;
        this.html = Lampa.Template.js("cub_iptv_content");
        this.inner_listener = Lampa.Subscribe();
        this.menu = new Menu(this.inner_listener);
        this.icons = new Icons(this.inner_listener);
        this.details = new Details(this.inner_listener);
        this.inner_listener.follow("toggle", (name) => {
          this[name].toggle();
          this.active = this[name];
        });
        this.inner_listener.follow("back", () => {
          this.listener.send("playlist-main");
        });
        this.inner_listener.follow("play", this.playChannel.bind(this));
        this.inner_listener.follow("play-archive", this.playArchive.bind(this));
        this.active = this.menu;
        this.html.find(".iptv-content__menu").append(this.menu.render());
        this.html.find(".iptv-content__channels").append(this.icons.render());
        this.html.find(".iptv-content__details").append(this.details.render());
      }
      build(data) {
        this.empty = false;
        this.menu.build(data);
        this.listener.send("display", this);
      }
      addToHistory(channel) {
        let board = Lampa.Storage.cache("iptv_play_history_main_board", 20, []);
        let find = board.find((a) => a.url == channel.url);
        if (find) Lampa.Arrays.remove(board, find);
        board.push(channel);
        Lampa.Storage.set("iptv_play_history_main_board", board);
      }
      playArchive(data) {
        let convert = (p) => {
          let item = {
            title: Lampa.Utils.parseTime(p.start).time + " - " + Lampa.Utils.capitalizeFirstLetter(p.title)
          };
          item.url = Url.catchupUrl(data.channel.url, data.channel.catchup.type, data.channel.catchup.source);
          item.url = Url.prepareUrl(item.url, p);
          item.need_check_live_stream = true;
          return item;
        };
        Lampa.Player.runas(Lampa.Storage.field("player_iptv"));
        Lampa.Player.play(convert(data.program));
        Lampa.Player.playlist(data.playlist.map(convert));
      }
      playChannel(data) {
        let cache = {};
        cache.none = [];
        let time;
        let update;
        let start_channel = Lampa.Arrays.clone(this.icons.icons_clone[data.position]);
        start_channel.original = this.icons.icons_clone[data.position];
        data.url = Url.prepareUrl(start_channel.url);
        if (this.archive && this.archive.channel == start_channel.original) {
          data.url = Url.catchupUrl(this.archive.channel.url, this.archive.channel.catchup.type, this.archive.channel.catchup.source);
          data.url = Url.prepareUrl(data.url, this.archive.program);
        } else {
          this.addToHistory(Lampa.Arrays.clone(start_channel));
        }
        data.locked = Boolean(Locked.find(Locked.format("channel", start_channel.original)));
        data.onGetChannel = (position) => {
          let original = this.icons.icons_clone[position];
          let channel = Lampa.Arrays.clone(original);
          let timeshift = this.archive && this.archive.channel == original ? this.archive.timeshift : 0;
          channel.name = Utils.clearChannelName(channel.name);
          channel.group = Utils.clearMenuName(channel.group);
          channel.url = Url.prepareUrl(channel.url);
          channel.icons = [];
          channel.original = original;
          if (timeshift) {
            channel.shift = timeshift;
            channel.url = Url.catchupUrl(original.url, channel.catchup.type, channel.catchup.source);
            channel.url = Url.prepareUrl(channel.url, this.archive.program);
          }
          if (Locked.find(Locked.format("channel", original))) {
            channel.locked = true;
          }
          if (Boolean(Favorites.find(channel))) {
            channel.icons.push(Lampa.Template.get("cub_iptv_icon_fav", {}, true));
          }
          if (Boolean(Locked.find(Locked.format("channel", channel)))) {
            channel.icons.push(Lampa.Template.get("cub_iptv_icon_lock", {}, true));
          }
          update = false;
          if (channel.id) {
            if (!cache[channel.id]) {
              cache[channel.id] = [];
              Api.program({
                name: channel.name,
                channel_id: channel.id,
                tvg: channel.tvg,
                time: EPG.time(channel, timeshift)
              }).then((program) => {
                cache[channel.id] = program;
              }).finally(() => {
                Lampa.Player.programReady({
                  channel,
                  position: EPG.position(channel, cache[channel.id], timeshift),
                  total: cache[channel.id].length
                });
              });
            } else {
              Lampa.Player.programReady({
                channel,
                position: EPG.position(channel, cache[channel.id], timeshift),
                total: cache[channel.id].length
              });
            }
          } else {
            Lampa.Player.programReady({
              channel,
              position: 0,
              total: 0
            });
          }
          return channel;
        };
        data.onMenu = (channel) => {
          this.hud = new HUD(channel);
          this.hud.listener.follow("close", () => {
            this.hud = this.hud.destroy();
            Lampa.Controller.toggle("player_tv");
          });
          this.hud.listener.follow("get_program_endless", () => {
            let program = cache[channel.id || "none"];
            let endless = this.details.playlist(channel, program, {
              onPlay: (param) => {
                Lampa.Player.close();
                this.playArchive(param);
              }
            });
            this.hud.listener.send("set_program_endless", { endless });
          });
          this.hud.listener.follow("action-favorite", (orig) => {
            Lampa.PlayerIPTV.redrawChannel();
            this.inner_listener.send("update-favorites");
            this.inner_listener.send("update-channel-icon", orig);
          });
          this.hud.listener.follow("action-locked", (orig) => {
            Lampa.PlayerIPTV.redrawChannel();
            this.inner_listener.send("update-channel-icon", orig);
          });
          this.hud.create();
        };
        data.onPlaylistProgram = (channel) => {
          let program = cache[channel.id || "none"];
          if (!program.length) return;
          let html = document.createElement("div");
          html.style.lineHeight = "1.4";
          Lampa.Modal.open({
            title: "",
            size: "medium",
            html: $(html)
          });
          let endless = this.details.playlist(channel, program, {
            onPlay: (param) => {
              Lampa.Modal.close();
              Lampa.Player.close();
              this.playArchive(param);
            }
          });
          html.append(endless.render());
          Lampa.Controller.add("modal", {
            invisible: true,
            toggle: () => {
              Lampa.Controller.collectionSet(html);
              Lampa.Controller.collectionFocus(false, html);
            },
            up: () => {
              endless.move(-1);
              Lampa.Controller.collectionSet(html);
              Lampa.Controller.collectionFocus(false, html);
            },
            down: () => {
              endless.move(1);
              Lampa.Controller.collectionSet(html);
              Lampa.Controller.collectionFocus(false, html);
            },
            back: () => {
              Lampa.Modal.close();
              Lampa.Controller.toggle("player_tv");
            }
          });
          Lampa.Controller.toggle("modal");
        };
        data.onPlay = (channel) => {
          Pilot.notebook("channel", this.icons.icons_clone.indexOf(channel.original));
          if (channel.original.added) {
            channel.original.view++;
            Favorites.update(channel.original);
          }
        };
        data.onGetProgram = (channel, position, container) => {
          update = false;
          let timeshift = channel.shift || 0;
          let program = cache[channel.id || "none"];
          let noprog = document.createElement("div");
          noprog.addClass("player-panel-iptv-item__prog-load");
          noprog.text(Lampa.Lang.translate("iptv_noprogram"));
          container[0].empty().append(noprog);
          if (program.length) {
            let start = EPG.position(channel, program, timeshift);
            let list = program.slice(position, position + 2);
            let now = program[start];
            if (list.length) container[0].empty();
            list.forEach((prog) => {
              let item = document.createElement("div");
              item.addClass("player-panel-iptv-item__prog-item");
              let span = document.createElement("span");
              span.html(Lampa.Utils.parseTime(prog.start).time + (now == prog ? " - " + Lampa.Utils.parseTime(prog.stop).time : "") + " &nbsp; " + Utils.clear(prog.title));
              item.append(span);
              if (now == prog) {
                item.addClass("watch");
                let timeline = document.createElement("div");
                timeline.addClass("player-panel-iptv-item__prog-timeline");
                let div = document.createElement("div");
                div.style.width = EPG.timeline(channel, prog, timeshift) + "%";
                timeline.append(div);
                update = () => {
                  let percent = EPG.timeline(channel, prog, timeshift);
                  div.style.width = percent + "%";
                  if (percent == 100) {
                    let next = EPG.position(channel, program, timeshift);
                    if (start !== next) {
                      Lampa.Player.programReady({
                        channel,
                        position: next,
                        total: cache[channel.id].length
                      });
                    }
                  }
                };
                item.append(timeline);
              }
              container[0].append(item);
            });
          }
        };
        Lampa.Player.iptv(data);
        time = setInterval(() => {
          if (update) update();
        }, 1e3 * 10);
        let destroy = () => {
          Lampa.Player.listener.remove("destroy", destroy);
          cache = null;
          update = null;
          this.archive = false;
          if (this.hud) this.hud = this.hud.destroy();
          Pilot.notebook("channel", -1);
          clearInterval(time);
        };
        Lampa.Player.listener.follow("destroy", destroy);
      }
      toggle() {
        if (this.empty) {
          Lampa.Controller.add("content", {
            invisible: true,
            toggle: () => {
              Lampa.Controller.clear();
            },
            left: () => {
              Lampa.Controller.toggle("menu");
            },
            up: () => {
              Lampa.Controller.toggle("head");
            },
            back: () => {
              this.listener.send("playlist-main");
            }
          });
          Lampa.Controller.toggle("content");
        } else this.active.toggle();
      }
      render() {
        return this.empty ? this.empty.render(true) : this.html;
      }
      load(playlist) {
        this.listener.send("loading");
        Api.playlist(playlist).then(this.build.bind(this)).catch((e) => {
          let msg = "";
          if (typeof e == "string") msg = e;
          else if (typeof e.responseJSON !== "undefined" && e.responseJSON.text) msg = Lampa.Lang.translate("torrent_error_connect") + ": " + e.responseJSON.text + (e.responseJSON.code ? " [" + e.responseJSON.code + "]" : "");
          else if (typeof e.status !== "undefined") msg = Lampa.Lang.translate("torrent_error_connect") + ": [" + e.status + "]" + (e.from_error ? " [" + e.from_error + "]" : "");
          else if (typeof e.message !== "undefined") msg = e.message;
          this.empty = new Lampa.Empty({ descr: '<div style="width: 60%; margin:0 auto; line-height: 1.4">' + Lampa.Lang.translate("iptv_noload_playlist") + (msg ? "<br><br>" + msg : "") + "</div>" });
          this.listener.send("display", this);
        });
      }
      destroy() {
        this.menu.destroy();
        this.icons.destroy();
        this.details.destroy();
        this.inner_listener.destroy();
        this.active = false;
        this.epg_cache = null;
        this.html.remove();
      }
    }

    function Component() {
      let html = document.createElement("div");
      let listener;
      let playlist;
      let channels;
      let initialized;
      window.iptv_mobile = window.innerWidth < 768;
      if (Lampa.Manifest.app_digital >= 185) {
        listener = Lampa.Subscribe();
        playlist = new Playlist(listener);
        channels = new Channels(listener);
      }
      this.create = function() {
        return this.render();
      };
      this.initialize = function() {
        this.activity.loader(true);
        if (Lampa.Manifest.app_digital >= 185) {
          listener.follow("display", (controller) => {
            this.active = controller;
            this.display(controller.render());
          });
          listener.follow("loading", this.loading.bind(this));
          listener.follow("channels-load", channels.load.bind(channels));
          listener.follow("playlist-main", playlist.main.bind(playlist));
          playlist.load();
        } else {
          let old = Lampa.Template.get("cub_iptv_list");
          old.find(".iptv-list__title").text(Lampa.Lang.translate("iptv_update_app_title"));
          old.find(".iptv-list__text").text(Lampa.Lang.translate("iptv_update_app_text"));
          $(html).append(old);
          this.activity.loader(false);
        }
        if (window.iptv_mobile) html.addClass("iptv-mobile");
      };
      this.playlist = function() {
        playlist.main();
      };
      this.loading = function() {
        this.activity.loader(true);
        this.active = false;
        this.start();
      };
      this.display = function(render) {
        html.empty().append(render);
        Lampa.Layer.update(html);
        Lampa.Layer.visible(html);
        this.activity.loader(false);
        this.start();
      };
      this.background = function() {
        Lampa.Background.immediately("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAZCAYAAABD2GxlAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAHASURBVHgBlZaLrsMgDENXxAf3/9XHFdXNZLm2YZHQymPk4CS0277v9+ffrut62nEcn/M8nzb69cxj6le1+75f/RqrZ9fatm3F9wwMR7yhawilNke4Gis/7j9srQbdaVFBnkcQ1WrfgmIIBcTrvgqqsKiTzvpOQbUnAykVW4VVqZXyyDllYFSKx9QaVrO7nGJIB63g+FAq/xhcHWBYdwCsmAtvFZUKE0MlVZWCT4idOlyhTp3K35R/6Nzlq0uBnsKWlEzgSh1VGJxv6rmpXMO7EK+XWUPnDFRWqitQFeY2UyZVryuWlI8ulLgGf19FooAUwC9gCWLcwzWPb7Wa60qdlZxjx6ooUuUqVQsK+y1VoAJyBeJAVsLJeYmg/RIXdG2kPhwYPBUQQyYF0XC8lwP3MTCrYAXB88556peCbUUZV7WccwkUQfCZC4PXdA5hKhSVhythZqjZM0J39w5m8BRadKAcrsIpNZsLIYdOqcZ9hExhZ1MH+QL+ciFzXzmYhZr/M6yUUwp2dp5U4naZDwAF5JRSefdScJZ3SkU0nl8xpaAy+7ml1EqvMXSs1HRrZ9bc3eZUSXmGa/mdyjbmqyX7A9RaYQa9IRJ0AAAAAElFTkSuQmCC");
      };
      this.start = function() {
        if (Lampa.Activity.active() && Lampa.Activity.active().activity !== this.activity) return;
        if (!initialized) {
          initialized = true;
          this.initialize();
        }
        this.background();
        Lampa.Controller.add("content", {
          invisible: true,
          toggle: () => {
            if (this.active) this.active.toggle();
            else {
              Lampa.Controller.collectionSet(html);
              Lampa.Controller.collectionFocus(false, html);
            }
          },
          left: () => {
            Lampa.Controller.toggle("menu");
          },
          up: () => {
            Lampa.Controller.toggle("head");
          },
          back: () => {
            Lampa.Activity.backward();
          }
        });
        Lampa.Controller.toggle("content");
      };
      this.pause = function() {
      };
      this.stop = function() {
      };
      this.render = function() {
        return html;
      };
      this.destroy = function() {
        if (playlist) playlist.destroy();
        if (channels) channels.destroy();
        listener.destroy();
        html.remove();
      };
    }

    const UnpackStream = (function() {
      var t = {}, n = Uint8Array, i = Uint16Array, e = Uint32Array, r = new n(0), a = new n([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]), s = new n([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]), o = new n([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]), h = function(t2, n2) {
        for (var r2 = new i(31), a2 = 0; a2 < 31; ++a2) r2[a2] = n2 += 1 << t2[a2 - 1];
        for (var s2 = new e(r2[30]), o2 = 1; o2 < 30; ++o2) for (var h2 = r2[o2]; h2 < r2[o2 + 1]; ++h2) s2[h2] = h2 - r2[o2] << 5 | o2;
        return [r2, s2];
      }, f = h(a, 2), l = f[0], p = f[1];
      l[28] = 258, p[258] = 28;
      var v, u = h(s, 0)[0], d = new i(32768);
      for (v = 0; v < 32768; ++v) {
        var c = (43690 & v) >>> 1 | (21845 & v) << 1;
        c = (61680 & (c = (52428 & c) >>> 2 | (13107 & c) << 2)) >>> 4 | (3855 & c) << 4, d[v] = ((65280 & c) >>> 8 | (255 & c) << 8) >>> 1;
      }
      var g = function(t2, n2, e2) {
        for (var r2 = t2.length, a2 = 0, s2 = new i(n2); a2 < r2; ++a2) t2[a2] && ++s2[t2[a2] - 1];
        var o2, h2 = new i(n2);
        for (a2 = 0; a2 < n2; ++a2) h2[a2] = h2[a2 - 1] + s2[a2 - 1] << 1;
        {
          o2 = new i(1 << n2);
          var f2 = 15 - n2;
          for (a2 = 0; a2 < r2; ++a2) if (t2[a2]) for (var l2 = a2 << 4 | t2[a2], p2 = n2 - t2[a2], v2 = h2[t2[a2] - 1]++ << p2, u2 = v2 | (1 << p2) - 1; v2 <= u2; ++v2) o2[d[v2] >>> f2] = l2;
        }
        return o2;
      }, w = new n(288);
      for (v = 0; v < 144; ++v) w[v] = 8;
      for (v = 144; v < 256; ++v) w[v] = 9;
      for (v = 256; v < 280; ++v) w[v] = 7;
      for (v = 280; v < 288; ++v) w[v] = 8;
      var y = new n(32);
      for (v = 0; v < 32; ++v) y[v] = 5;
      var m = g(w, 9), b = g(y, 5), T = function(t2) {
        for (var n2 = t2[0], i2 = 1; i2 < t2.length; ++i2) t2[i2] > n2 && (n2 = t2[i2]);
        return n2;
      }, E = function(t2, n2, i2) {
        var e2 = n2 / 8 | 0;
        return (t2[e2] | t2[e2 + 1] << 8) >> (7 & n2) & i2;
      }, k = function(t2, n2) {
        var i2 = n2 / 8 | 0;
        return (t2[i2] | t2[i2 + 1] << 8 | t2[i2 + 2] << 16) >> (7 & n2);
      }, C = function(t2, r2, a2) {
        (null == r2 || r2 < 0) && (r2 = 0), (null == a2 || a2 > t2.length) && (a2 = t2.length);
        var s2 = new (2 === t2.BYTES_PER_ELEMENT ? i : 4 === t2.BYTES_PER_ELEMENT ? e : n)(a2 - r2);
        return s2.set(t2.subarray(r2, a2)), s2;
      };
      t.FlateErrorCode = { UnexpectedEOF: 0, InvalidBlockType: 1, InvalidLengthLiteral: 2, InvalidDistance: 3, StreamFinished: 4, NoStreamHandler: 5, InvalidHeader: 6, NoCallback: 7, InvalidUTF8: 8, ExtraFieldTooLong: 9, InvalidDate: 10, FilenameTooLong: 11, StreamFinishing: 12, InvalidZipData: 13, UnknownCompressionMethod: 14 };
      var F = ["unexpected EOF", "invalid block type", "invalid length/literal", "invalid distance", "stream finished", "no stream handler", "invalid header", "no callback", "invalid UTF-8 data", "extra field too long", "date not in range 1980-2099", "filename too long", "stream finishing", "invalid zip data", "determined by unknown compression method"], S = function(t2, n2, i2) {
        var e2 = new Error(n2 || F[t2]);
        if (e2.code = t2, true) throw e2;
      }, x = (function() {
        function t2(t3) {
          this.s = {}, this.p = new n(0), this.ondata = t3;
        }
        return t2.prototype.e = function(t3) {
          this.ondata || S(5), this.d && S(4);
          var i2 = this.p.length, e2 = new n(i2 + t3.length);
          e2.set(this.p), e2.set(t3, i2), this.p = e2;
        }, t2.prototype.c = function(t3) {
          this.d = this.s.i = t3 || false;
          var i2 = this.s.b, e2 = (function(t4, i3, e3) {
            var r2 = t4.length;
            if (!r2 || e3 && e3.f && !e3.l) return i3 || new n(0);
            var h2 = !i3 || e3, f2 = !e3 || e3.i;
            e3 || (e3 = {}), i3 || (i3 = new n(3 * r2));
            var p2 = function(t5) {
              var e4 = i3.length;
              if (t5 > e4) {
                var r3 = new n(Math.max(2 * e4, t5));
                r3.set(i3), i3 = r3;
              }
            }, v2 = e3.f || 0, d2 = e3.p || 0, c2 = e3.b || 0, w2 = e3.l, y2 = e3.d, F2 = e3.m, x2 = e3.n, I2 = 8 * r2;
            do {
              if (!w2) {
                v2 = E(t4, d2, 1);
                var U2 = E(t4, d2 + 1, 3);
                if (d2 += 3, !U2) {
                  var D2 = 4 + ((d2 + 7) / 8 | 0), L2 = t4[D2 - 4] | t4[D2 - 3] << 8, z = D2 + L2;
                  if (z > r2) {
                    f2 && S(0);
                    break;
                  }
                  h2 && p2(c2 + L2), i3.set(t4.subarray(D2, z), c2), e3.b = c2 += L2, e3.p = d2 = 8 * z, e3.f = v2;
                  continue;
                }
                if (1 === U2) w2 = m, y2 = b, F2 = 9, x2 = 5;
                else if (2 === U2) {
                  var B = E(t4, d2, 31) + 257, M = E(t4, d2 + 10, 15) + 4, N = B + E(t4, d2 + 5, 31) + 1;
                  d2 += 14;
                  var _, A = new n(N), G = new n(19);
                  for (_ = 0; _ < M; ++_) G[o[_]] = E(t4, d2 + 3 * _, 7);
                  d2 += 3 * M;
                  var H = T(G), O = (1 << H) - 1, P = g(G, H);
                  for (_ = 0; _ < N; ) {
                    var R = P[E(t4, d2, O)];
                    d2 += 15 & R;
                    var Y = R >>> 4;
                    if (Y < 16) A[_++] = Y;
                    else {
                      var Z = 0, j = 0;
                      for (16 === Y ? (j = 3 + E(t4, d2, 3), d2 += 2, Z = A[_ - 1]) : 17 === Y ? (j = 3 + E(t4, d2, 7), d2 += 3) : 18 === Y && (j = 11 + E(t4, d2, 127), d2 += 7); j--; ) A[_++] = Z;
                    }
                  }
                  var q = A.subarray(0, B), J = A.subarray(B);
                  F2 = T(q), x2 = T(J), w2 = g(q, F2), y2 = g(J, x2);
                } else S(1);
                if (d2 > I2) {
                  f2 && S(0);
                  break;
                }
              }
              h2 && p2(c2 + 131072);
              for (var K = (1 << F2) - 1, Q = (1 << x2) - 1, V = d2; ; V = d2) {
                var W = w2[k(t4, d2) & K], X = W >>> 4;
                if ((d2 += 15 & W) > I2) {
                  f2 && S(0);
                  break;
                }
                if (W || S(2), X < 256) i3[c2++] = X;
                else {
                  if (256 === X) {
                    V = d2, w2 = null;
                    break;
                  }
                  var $ = X - 254;
                  if (X > 264) {
                    var tt = X - 257, nt = a[tt];
                    $ = E(t4, d2, (1 << nt) - 1) + l[tt], d2 += nt;
                  }
                  var it = y2[k(t4, d2) & Q], et = it >>> 4;
                  it || S(3), d2 += 15 & it;
                  var rt = u[et];
                  if (et > 3) {
                    var at = s[et];
                    rt += k(t4, d2) & (1 << at) - 1, d2 += at;
                  }
                  if (d2 > I2) {
                    f2 && S(0);
                    break;
                  }
                  h2 && p2(c2 + 131072);
                  for (var st = c2 + $; c2 < st; c2 += 4) i3[c2] = i3[c2 - rt], i3[c2 + 1] = i3[c2 + 1 - rt], i3[c2 + 2] = i3[c2 + 2 - rt], i3[c2 + 3] = i3[c2 + 3 - rt];
                  c2 = st;
                }
              }
              e3.l = w2, e3.p = V, e3.b = c2, e3.f = v2, w2 && (v2 = 1, e3.m = F2, e3.d = y2, e3.n = x2);
            } while (!v2);
            return c2 === i3.length ? i3 : C(i3, 0, c2);
          })(this.p, this.o, this.s);
          this.ondata(C(e2, i2, this.s.b), this.d), this.o = C(e2, this.s.b - 32768), this.s.b = this.o.length, this.p = C(this.p, this.s.p / 8 | 0), this.s.p &= 7;
        }, t2.prototype.push = function(t3, n2) {
          this.e(t3), this.c(n2);
        }, t2;
      })();
      t.Inflate = x;
      var I = (function() {
        function t2(t3) {
          this.ondata = t3;
        }
        return t2.prototype.push = function(t3, n2) {
          this.ondata(t3, n2);
        }, t2;
      })();
      t.TextBytes = I;
      var U = (function() {
        function t2(t3) {
          this.v = 1, x.call(this, t3);
        }
        return t2.prototype.push = function(t3, n2) {
          if (x.prototype.e.call(this, t3), this.v) {
            var i2 = this.p.length > 3 ? (function(t4) {
              31 === t4[0] && 139 === t4[1] && 8 === t4[2] || S(6, "invalid gzip data");
              var n3 = t4[3], i3 = 10;
              4 & n3 && (i3 += t4[10] | 2 + (t4[11] << 8));
              for (var e2 = (n3 >> 3 & 1) + (n3 >> 4 & 1); e2 > 0; ) e2 -= !t4[i3++];
              return i3 + (2 & n3);
            })(this.p) : 4;
            if (i2 >= this.p.length && !n2) return;
            this.p = this.p.subarray(i2), this.v = 0;
          }
          n2 && (this.p.length < 8 && S(6, "invalid gzip data"), this.p = this.p.subarray(0, -8)), x.prototype.c.call(this, n2);
        }, t2;
      })();
      t.Gunzip = U, t.Decompress = (function() {
        function t2(t3) {
          this.G = U, this.I = x, this.T = I, this.ondata = t3;
        }
        return t2.prototype.push = function(t3, i2) {
          if (this.ondata || S(5), this.s) this.s.push(t3, i2);
          else {
            if (this.p && this.p.length) {
              var e2 = new n(this.p.length + t3.length);
              e2.set(this.p), e2.set(t3, this.p.length);
            } else this.p = t3;
            if (this.p.length > 2) {
              var r2 = this, a2 = function() {
                r2.ondata.apply(r2, arguments);
              };
              this.s = 31 === this.p[0] && 139 === this.p[1] && 8 === this.p[2] ? new this.G(a2) : new this.T(a2), this.s.push(this.p, i2), this.p = null;
            }
          }
        }, t2;
      })();
      var D = "undefined" != typeof TextDecoder && new TextDecoder(), L = 0;
      try {
        D.decode(r, { stream: true }), L = 1;
      } catch (t2) {
      }
      return t.DecodeUTF8 = (function() {
        function t2(t3) {
          this.ondata = t3, L ? this.t = new TextDecoder() : this.p = r;
        }
        return t2.prototype.push = function(t3, i2) {
          if (this.ondata || S(5), i2 = !!i2, this.t) return this.ondata(this.t.decode(t3, { stream: true }), i2), void (i2 && (this.t.decode().length && S(8), this.t = null));
          this.p || S(4);
          var e2 = new n(this.p.length + t3.length);
          e2.set(this.p), e2.set(t3, this.p.length);
          var r2 = (function(t4) {
            for (var n2 = "", i3 = 0; ; ) {
              var e3 = t4[i3++], r3 = (e3 > 127) + (e3 > 223) + (e3 > 239);
              if (i3 + r3 > t4.length) return [n2, C(t4, i3 - 1)];
              r3 ? 3 === r3 ? (e3 = ((15 & e3) << 18 | (63 & t4[i3++]) << 12 | (63 & t4[i3++]) << 6 | 63 & t4[i3++]) - 65536, n2 += String.fromCharCode(55296 | e3 >> 10, 56320 | 1023 & e3)) : n2 += 1 & r3 ? String.fromCharCode((31 & e3) << 6 | 63 & t4[i3++]) : String.fromCharCode((15 & e3) << 12 | (63 & t4[i3++]) << 6 | 63 & t4[i3++]) : n2 += String.fromCharCode(e3);
            }
          })(e2), a2 = r2[0], s2 = r2[1];
          i2 ? (s2.length && S(8), this.p = null) : this.p = s2, this.ondata(a2, i2);
        }, t2;
      })(), t;
    })();

    let cur_time = 0;
    let channel = {};
    let maxChunkSize = 4 * 1024;
    let string_data = "";
    let percent = -1;
    let this_res = null;
    let load_end = false;
    let chunk_parse = false;
    let dcmpStrm = function() {
    };
    let content_type = "";
    let cur_pos = 0;
    let content_length = 0;
    let listener = Lampa.Subscribe();
    function nextChunk() {
      if (chunk_parse || this_res === null) return;
      chunk_parse = true;
      let len = this_res.responseText.length;
      let maxPos = Math.min(cur_pos + maxChunkSize, len);
      if (maxPos > cur_pos) {
        let finish = load_end && maxPos === len;
        dcmpStrm.push(str2ab(this_res.responseText.substring(cur_pos, maxPos)), finish);
        cur_pos = maxPos;
        percent = content_length ? cur_pos * 100 / content_length : load_end ? cur_pos * 100 / len : -1;
        listener.send("percent", {
          percent
        });
        if (finish) {
          parseFinish();
          listener.send("end", {
            time: unixtime() - cur_time,
            channel
          });
          channel = {};
        }
      }
      chunk_parse = false;
      requestFrame();
    }
    function parseChannel(attr, string) {
      if (!attr["id"]) return;
      string = string.replace(/\n/g, "");
      let names = [];
      let m_name = string.match(/<display-name[^>]+>(.*?)</g);
      let m_icon = string.match(/<icon src="(.*?)"/);
      if (m_name) {
        names = m_name.map((n) => {
          return n.slice(0, -1).split(">")[1];
        });
      }
      channel[attr.id] = {
        id: attr.id,
        names,
        icon: m_icon ? m_icon[1] : "",
        program: []
      };
      listener.send("channel", { channel: channel[attr.id] });
    }
    function parseProgramme(attr, string) {
      if (!attr["channel"] || !attr["start"] || !attr["stop"] || !channel[attr.channel]) return;
      let start = parseDate(attr.start);
      let stop = parseDate(attr.stop);
      string = string.replace(/\n/g, "");
      let m_title = string.match(/<title\s+lang="ru">(.*?)</);
      let m_category = string.match(/<category\s+lang="ru">(.*?)</);
      let m_desc = string.match(/<desc\s+lang="ru">(.*?)</);
      let m_icon = string.match(/<icon src="(.*?)"/);
      if (!m_title) m_title = string.match(/<title[^>]+>(.*?)</);
      if (!m_category) m_category = string.match(/<category[^>]+>(.*?)</);
      if (!m_desc) m_desc = string.match(/<desc[^>]+>(.*?)</);
      let title = m_title ? m_title[1] : "";
      let category = m_category ? m_category[1] : "";
      let desc = m_desc ? m_desc[1] : "";
      let icon = m_icon ? m_icon[1] : "";
      let prog = {
        start: start * 1e3,
        stop: stop * 1e3,
        title,
        category,
        desc,
        icon
      };
      listener.send("program", { program: prog, id: attr.channel, channel: channel[attr.channel] });
    }
    function parseDate(s) {
      return Date.parse(
        s.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+([+-]\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6$7:$8")
      ) / 1e3;
    }
    function parseParams(s) {
      let o = {}, m, mm;
      if (!!(m = s.match(/([^\s=]+)=((["'])(.*?)\3|\S+)/g))) {
        for (let i = 0; i < m.length; i++) {
          if (!!(mm = m[i].match(/([^\s=]+)=((["'])(.*?)\3|\S+)/))) {
            o[mm[1].toLowerCase()] = mm[4] || mm[2];
          }
        }
      }
      return o;
    }
    function unixtime() {
      return Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3);
    }
    function str2ab(str) {
      let buf = new ArrayBuffer(str.length), bufView = new Uint8Array(buf), i = 0;
      for (; i < str.length; i++) bufView[i] = str.charCodeAt(i) & 255;
      return bufView;
    }
    function parseFinish() {
      string_data = "";
      percent = -1;
      this_res = null;
      load_end = false;
      chunk_parse = false;
      dcmpStrm = function() {
      };
      content_type = "";
      cur_pos = 0;
      content_length = 0;
    }
    function requestFrame() {
      requestAnimationFrame(nextChunk);
    }
    function parseStart(url) {
      parseFinish();
      channel = {};
      let chOrProgRegExp;
      try {
        chOrProgRegExp = new RegExp("\\s*<(programme|channel)(\\s+([^>]+)?)?>(.*?)<\\/\\1\\s*>\\s*", "gs");
      } catch (e) {
        chOrProgRegExp = new RegExp("\\s*<(programme|channel)(\\s+([^>]+)?)?>((.|\\n)*?)<\\/\\1\\s*>\\s*", "g");
      }
      cur_time = unixtime();
      listener.send("start");
      let xhr = new XMLHttpRequest();
      let utfDecode = new UnpackStream.DecodeUTF8(function(data, final) {
        string_data += data;
        let lenStart = string_data.length;
        string_data = string_data.replace(
          chOrProgRegExp,
          function(match, p1, p2, p3, p4) {
            if (p1 === "channel") parseChannel(parseParams(p3), p4);
            else parseProgramme(parseParams(p3), p4);
            return "";
          }
        );
        if (lenStart === string_data.length && lenStart > 204800) {
          let text = "Bad xml.gz file";
          console.log("IPTV", text, string_data.substring(0, 4096) + "...");
          if (!load_end) xhr.abort();
          parseFinish();
          listener.send("error", {
            text
          });
        }
      });
      dcmpStrm = new UnpackStream.Decompress(function(chunk, final) {
        utfDecode.push(chunk, final);
      });
      xhr.open("get", url);
      xhr.responseType = "text";
      xhr.overrideMimeType("text/plain; charset=x-user-defined");
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 2) {
          content_type = xhr.getResponseHeader("content-type") || content_type;
          content_length = xhr.getResponseHeader("content-length") || content_length;
          console.log("IPTV", "Content-Type", content_type);
          console.log("IPTV", "Content-Length", content_length);
          requestFrame();
        }
      };
      xhr.onload = xhr.onprogress = function(e) {
        this_res = this;
        load_end = e.type === "load";
      };
      xhr.onerror = function() {
        parseFinish();
        listener.send("error", {
          text: "Error connect (CORS or bad URL)"
        });
      };
      xhr.onabort = function() {
        parseFinish();
        listener.send("error", {
          text: "Load abort"
        });
      };
      xhr.ontimeout = function() {
        parseFinish();
        listener.send("error", {
          text: "Load timeout"
        });
      };
      xhr.send();
    }
    var Parser = {
      listener,
      start: parseStart
    };

    class Guide {
      static init() {
        if (Lampa.Storage.field("iptv_guide_update_after_start")) this.update();
        setInterval(() => {
          let lastupdate = Lampa.Storage.get("iptv_guide_updated_status", "{}").time || 0;
          if (Lampa.Storage.field("iptv_guide_interval") > 0 && lastupdate + 1e3 * 60 * 60 * Lampa.Storage.field("iptv_guide_interval") < Date.now()) this.update();
        }, 1e3 * 60);
      }
      static update(status_elem) {
        let url = Lampa.Storage.get("iptv_guide_url");
        if (Lampa.Storage.field("iptv_guide_custom") && url) {
          if (!window.iptv_guide_update_process) {
            window.iptv_guide_update_process = Parser.listener;
            let last_id = -1;
            let program = [];
            Parser.listener.follow("program", (data) => {
              if (last_id == data.id) program.push(data.program);
              else {
                DB.rewriteData("epg", last_id, program).finally(() => {
                });
                last_id = data.id;
                program = [data.program];
              }
            });
            Parser.listener.follow("channel", (data) => {
              data.channel.names.forEach((name) => {
                DB.addData("epg_channels", name.toLowerCase(), {
                  id: data.channel.id,
                  ic: data.channel.icon
                }).catch(() => {
                });
              });
            });
            if (Lampa.Processing) {
              Parser.listener.follow("percent", (data) => {
                Lampa.Processing.push("iptv", data.percent);
              });
            }
            Parser.listener.follow("end", (data) => {
              program = [];
              let count = Lampa.Arrays.getKeys(data.channel).length;
              Lampa.Storage.set("iptv_guide_updated_status", {
                type: "finish",
                channels: count,
                time: Date.now()
              });
              Parser.listener.send("finish", { count, time: Date.now() });
              window.iptv_guide_update_process.destroy();
              window.iptv_guide_update_process = false;
            });
            Parser.listener.follow("error", (data) => {
              window.iptv_guide_update_process.destroy();
              window.iptv_guide_update_process = false;
              Lampa.Storage.set("iptv_guide_updated_status", {
                type: "error",
                text: data.text,
                time: Date.now()
              });
            });
            if (DB.clearTable) {
              DB.clearTable("epg").finally(() => {
              });
              DB.clearTable("epg_channels").finally(() => {
              });
            }
            setTimeout(() => {
              Parser.start(url);
            }, 100);
          }
        } else if (status_elem) {
          Lampa.Noty.show(Lampa.Lang.translate("iptv_guide_error_link"));
        }
      }
    }

    function init$2() {
      Lampa.Template.add("cub_iptv_content", `
        <div class="iptv-content">
            <div class="iptv-content__menu"></div>
            <div class="iptv-content__channels"></div>
            <div class="iptv-content__details"></div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_menu", `
        <div class="iptv-menu">
            <div class="iptv-menu__body">
                <div class="iptv-menu__head">
                    <div class="iptv-menu__title"></div>
                    <div class="iptv-menu__search selector">
                        <svg width="23" height="22" viewBox="0 0 23 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="9.9964" cy="9.63489" r="8.43556" stroke="currentColor" stroke-width="2.4"></circle>
                            <path d="M20.7768 20.4334L18.2135 17.8701" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>
                        </svg>
                    </div>
                </div>
                <div class="iptv-menu__list"></div>
            </div>
        </div>
    `);
      Lampa.Template.add("iptv_menu_mobile_button_search", `
        <div class="iptv-menu__search-mobile selector">
            <svg width="23" height="22" viewBox="0 0 23 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9.9964" cy="9.63489" r="8.43556" stroke="currentColor" stroke-width="2.4"></circle>
                <path d="M20.7768 20.4334L18.2135 17.8701" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>
            </svg>
        </div>
    `);
      Lampa.Template.add("cub_iptv_channels", `
        <div class="iptv-channels">
            
        </div>
    `);
      Lampa.Template.add("cub_iptv_details", `
        <div class="iptv-details layer--wheight">
            <div class="iptv-details__play"></div>
            <div class="iptv-details__title"></div>

            <div class="iptv-details__program">

            </div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_details_empty", `
        <div class="iptv-details-epmty endless endless-up">
            <div><span></span><span style="width: 60%"></span></div>
            <div><span></span><span style="width: 70%"></span></div>
            <div><span></span><span style="width: 40%"></span></div>
            <div><span></span><span style="width: 55%"></span></div>
            <div><span></span><span style="width: 30%"></span></div>
            <div><span></span><span style="width: 55%"></span></div>
            <div><span></span><span style="width: 30%"></span></div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_playlist_item", `
        <div class="iptv-playlist-item selector layer--visible layer--render">
            <div class="iptv-playlist-item__body">
                <div class="iptv-playlist-item__name">
                    <div class="iptv-playlist-item__name-ico"><span></span></div>
                    <div class="iptv-playlist-item__name-text">est</div>
                </div>
                <div class="iptv-playlist-item__url"></div>
            </div>

            <div class="iptv-playlist-item__footer hide">
                <div class="iptv-playlist-item__details details-left"></div>
                <div class="iptv-playlist-item__details details-right"></div>
            </div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_list_add_custom", `
        <div class="iptv-playlist-item selector layer--visible">
            <div class="iptv-playlist-item__title">
                
            </div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_list", `
        <div class="iptv-list layer--wheight">
            <div class="iptv-list__ico">
                <svg height="36" viewBox="0 0 38 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="8" width="34" height="21" rx="3" stroke="white" stroke-width="3"/>
                    <line x1="13.0925" y1="2.34874" x2="16.3487" y2="6.90754" stroke="white" stroke-width="3" stroke-linecap="round"/>
                    <line x1="1.5" y1="-1.5" x2="9.31665" y2="-1.5" transform="matrix(-0.757816 0.652468 0.652468 0.757816 26.197 2)" stroke="white" stroke-width="3" stroke-linecap="round"/>
                    <line x1="9.5" y1="34.5" x2="29.5" y2="34.5" stroke="white" stroke-width="3" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="iptv-list__title"></div>
            <div class="iptv-list__text"></div>
            <div class="iptv-list__items"></div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_list_empty", `
        <div class="iptv-list-empty selector">
            <div class="iptv-list-empty__text"></div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_param_lock", `
        <div class="iptv-param-lock">
            <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="512" height="512" viewBox="0 0 401.998 401.998" xml:space="preserve"><path d="M357.45 190.721c-5.331-5.33-11.8-7.993-19.417-7.993h-9.131v-54.821c0-35.022-12.559-65.093-37.685-90.218C266.093 12.563 236.025 0 200.998 0c-35.026 0-65.1 12.563-90.222 37.688-25.126 25.126-37.685 55.196-37.685 90.219v54.821h-9.135c-7.611 0-14.084 2.663-19.414 7.993-5.33 5.326-7.994 11.799-7.994 19.417V374.59c0 7.611 2.665 14.086 7.994 19.417 5.33 5.325 11.803 7.991 19.414 7.991H338.04c7.617 0 14.085-2.663 19.417-7.991 5.325-5.331 7.994-11.806 7.994-19.417V210.135c.004-7.612-2.669-14.084-8.001-19.414zm-83.363-7.993H127.909v-54.821c0-20.175 7.139-37.402 21.414-51.675 14.277-14.275 31.501-21.411 51.678-21.411 20.179 0 37.399 7.135 51.677 21.411 14.271 14.272 21.409 31.5 21.409 51.675v54.821z" fill="currentColor"></path></svg>
        </div>
    `);
      Lampa.Template.add("cub_iptv_icon_favorite", `
        <svg width="65" height="87" viewBox="0 0 65 87" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M36.1884 47.9221L32.5 42.6448L28.8116 47.9221L5.40983 81.4046C5.33938 81.5054 5.28461 81.5509 5.25807 81.5702C5.23028 81.5904 5.2049 81.6024 5.17705 81.611C5.11471 81.6301 4.99693 81.6414 4.84985 81.5951C4.70278 81.5488 4.61273 81.472 4.57257 81.4207C4.55463 81.3977 4.54075 81.3733 4.52953 81.3408C4.51882 81.3098 4.5 81.2411 4.5 81.1182V13C4.5 8.30558 8.30558 4.5 13 4.5H52C56.6944 4.5 60.5 8.30558 60.5 13V81.1182C60.5 81.2411 60.4812 81.3098 60.4705 81.3408C60.4593 81.3733 60.4454 81.3977 60.4274 81.4207C60.3873 81.472 60.2972 81.5488 60.1502 81.5951C60.0031 81.6414 59.8853 81.6301 59.8229 81.611C59.7951 81.6024 59.7697 81.5904 59.7419 81.5702C59.7154 81.5509 59.6606 81.5054 59.5902 81.4046L36.1884 47.9221Z" stroke="currentColor" stroke-width="9"/>
            <path class="active-layer" d="M0 13C0 5.8203 5.8203 0 13 0H52C59.1797 0 65 5.8203 65 13V81.1182C65 86.0086 58.7033 87.9909 55.9018 83.9825L32.5 50.5L9.09823 83.9825C6.29666 87.9909 0 86.0086 0 81.1182V13Z" fill="currentColor"/>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_icon_lock", `
        <svg width="420" height="512" viewBox="0 0 420 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M384.532 232.729C394.233 232.729 402.472 236.121 409.262 242.91C416.053 249.698 419.457 257.941 419.452 267.636V477.092C419.452 486.786 416.053 495.033 409.271 501.822C402.48 508.608 394.242 512 384.541 512H35.4568C25.7632 512 17.5189 508.604 10.7304 501.822C3.9432 495.033 0.54895 486.786 0.54895 477.092V267.64C0.54895 257.937 3.94192 249.693 10.7304 242.91C17.5189 236.121 25.7632 232.729 35.4568 232.729H47.0915V162.907C47.0915 118.301 63.0871 80.0023 95.0886 48.0009C127.085 16.0007 165.388 0 209.999 0C254.61 0 292.906 16.0007 324.905 48.0021C356.907 80.0023 372.902 118.302 372.902 162.907V232.729H384.532ZM116.91 162.907V232.729H303.088V162.907C303.088 137.212 293.996 115.269 275.82 97.092C257.635 78.9095 235.703 69.8221 210.003 69.8221C184.304 69.8221 162.367 78.9108 144.183 97.092C126.002 115.271 116.91 137.212 116.91 162.907ZM62 293C53.7157 293 47 299.716 47 308V445C47 453.284 53.7157 460 62 460H358C366.284 460 373 453.284 373 445V308C373 299.716 366.284 293 358 293H62Z" fill="currentColor"/>
        <rect class="active-layer" x="33" y="275" width="354" height="203" rx="15" fill="currentColor"/>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_icon_fav", `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve">
            <path fill="currentColor" d="M391.416,0H120.584c-17.778,0-32.242,14.464-32.242,32.242v460.413c0,7.016,3.798,13.477,9.924,16.895
            c2.934,1.638,6.178,2.45,9.421,2.45c3.534,0,7.055-0.961,10.169-2.882l138.182-85.312l138.163,84.693
            c5.971,3.669,13.458,3.817,19.564,0.387c6.107-3.418,9.892-9.872,9.892-16.875V32.242C423.657,14.464,409.194,0,391.416,0z
            M384.967,457.453l-118.85-72.86c-6.229-3.817-14.07-3.798-20.28,0.032l-118.805,73.35V38.69h257.935V457.453z"></path>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_icon_all", `
        <svg height="30" viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="1.5" width="35" height="27" rx="1.5" stroke="currentColor" stroke-width="3"></rect>
            <rect x="6" y="7" width="25" height="3" fill="currentColor"></rect>
            <rect x="6" y="13" width="13" height="3" fill="currentColor"></rect>
            <rect x="6" y="19" width="19" height="3" fill="currentColor"></rect>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_icon_group", `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve">
            <path fill="currentColor" d="M478.354,146.286H33.646c-12.12,0-21.943,9.823-21.943,21.943v321.829c0,12.12,9.823,21.943,21.943,21.943h444.709
                c12.12,0,21.943-9.823,21.943-21.943V168.229C500.297,156.109,490.474,146.286,478.354,146.286z M456.411,468.114H55.589V190.171
                h400.823V468.114z"></path>
            <path fill="currentColor" d="M441.783,73.143H70.217c-12.12,0-21.943,9.823-21.943,21.943c0,12.12,9.823,21.943,21.943,21.943h371.566
                c12.12,0,21.943-9.823,21.943-21.943C463.726,82.966,453.903,73.143,441.783,73.143z"></path>
            <path fill="currentColor" d="M405.211,0H106.789c-12.12,0-21.943,9.823-21.943,21.943c0,12.12,9.823,21.943,21.943,21.943h298.423
                c12.12,0,21.943-9.823,21.943-21.943C427.154,9.823,417.331,0,405.211,0z"></path>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_icon_searched", `
        <svg height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="1.5" width="25" height="31" rx="2.5" stroke="currentColor" stroke-width="3"></rect>
            <rect x="6" y="7" width="16" height="3" rx="1.5" fill="currentColor"></rect>
            <rect x="6" y="13" width="16" height="3" rx="1.5" fill="currentColor"></rect>
        </svg>
    `);
      Lampa.Template.add("cub_iptv_hud", `
        <div class="iptv-hud">
            <div class="iptv-hud__content">
                <div class="iptv-hud__menu"></div>
                <div class="iptv-hud__program"></div>
            </div>
        </div>
    `);
      Lampa.Template.add("cub_iptv_channel_main_board", `
        <div class="iptv-channel iptv-channel--main selector layer--visible layer--render">
            <div class="iptv-channel__body">
                <img class="iptv-channel__ico">
            </div>
        </div>
    `);
      Lampa.Template.add("settings_iptv_guide", `<div>
        <div class="settings-param selector" data-type="toggle" data-name="iptv_guide_custom" data-children="use_custom_guide">
            <div class="settings-param__name">#{iptv_param_guide_custom_title}</div>
            <div class="settings-param__value"></div>
            <div class="settings-param__descr">#{iptv_param_guide_custom_descr}</div>
        </div>
        <div data-parent="use_custom_guide">
            <div class="settings-param selector" data-type="input" data-name="iptv_guide_url" placeholder="#{torrent_parser_set_link}">
                <div class="settings-param__name">#{settings_parser_jackett_link}</div>
                <div class="settings-param__value"></div>
                <div class="settings-param__descr">#{iptv_param_guide_url_descr}</div>
            </div>
            <div class="settings-param selector" data-type="select" data-name="iptv_guide_save">
                <div class="settings-param__name">#{iptv_param_guide_save_title}</div>
                <div class="settings-param__value"></div>
                <div class="settings-param__descr">#{iptv_param_guide_save_descr}</div>
            </div>
            <div class="settings-param selector" data-type="select" data-name="iptv_guide_interval">
                <div class="settings-param__name">#{iptv_param_guide_interval_title}</div>
                <div class="settings-param__value"></div>
                <div class="settings-param__descr">#{iptv_param_guide_interval_descr}</div>
            </div>
            <div class="settings-param selector" data-type="toggle" data-name="iptv_guide_update_after_start">
                <div class="settings-param__name">#{iptv_param_guide_update_after_start}</div>
                <div class="settings-param__value"></div>
            </div>
            <div class="settings-param selector settings-param--button update-guide-now" data-static="true">
                <div class="settings-param__name">#{iptv_param_guide_update_now}</div>
            </div>
            <div class="settings-param update-guide-status" data-static="true">
                <div class="settings-param__name">#{iptv_guide_status_finish}</div>
                <div class="settings-param__value">#{iptv_guide_status_noupdates}</div>
            </div>
        </div>
    </div>`);
      if (window.lampa_settings.iptv) {
        Lampa.Template.add("about", `<div class="about">
            <div>#{iptv_about_text}</div>
        
            <div class="overhide">
                <div class="about__contacts">
                    <div>
                        <small>#{about_channel}</small><br>
                        @lampa_channel
                    </div>
        
                    <div>
                        <small>#{about_group}</small><br>
                        @lampa_group
                    </div>
        
                    <div>
                        <small>#{about_version}</small><br>
                        <span class="version_app"></span>
                    </div>
        
                    <div class="hide platform_android">
                        <small>#{about_version} Android APK</small><br>
                        <span class="version_android"></span>
                    </div>
                </div>
            </div>
        </div>`);
      }
      Lampa.Template.add("cub_iptv_style", `
        <style>
        .iptv-list {  padding: 1.5em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-box-pack: center;  -webkit-justify-content: center;      -ms-flex-pack: center;          justify-content: center;  -webkit-box-orient: vertical;  -webkit-box-direction: normal;  -webkit-flex-direction: column;      -ms-flex-direction: column;          flex-direction: column;  padding-bottom: 1em;}.iptv-list__ico {  width: 4.5em;  margin-bottom: 2em;  height: 4.5em;}.iptv-list__ico > svg {  width: 4.5em;  height: 4.5em;}.iptv-list__title {  font-size: 1.9em;  margin-bottom: 1em;}.iptv-list__text {  font-size: 1.2em;  line-height: 1.4;  margin-bottom: 1em;  text-align: center;  width: 60%;  margin: 0 auto;  margin-bottom: 2em;}@media screen and (max-width: 767px) {  .iptv-list__text {    width: 100%;  }}.iptv-list__items {  width: 80%;  margin: 0 auto;}.iptv-list__items .scroll {  height: 22em;}@media screen and (max-width: 767px) {  .iptv-list__items {    width: 100%;  }}.iptv-list__item {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  padding: 1em;  background-color: rgba(255, 255, 255, 0.1);  font-size: 1.3em;  line-height: 1.3;  -webkit-border-radius: 0.3em;          border-radius: 0.3em;  margin: 1em;}.iptv-list__item-name {  width: 40%;  padding-right: 1em;  overflow: hidden;  -o-text-overflow: ellipsis;     text-overflow: ellipsis;  white-space: nowrap;  text-align: left;}.iptv-list__item-url {  width: 60%;  padding-left: 1em;  overflow: hidden;  -o-text-overflow: ellipsis;     text-overflow: ellipsis;  white-space: nowrap;  text-align: right;}.iptv-list__item.focus {  background-color: #fff;  color: black;}.iptv-playlist-item {  padding: 1em;  background-color: rgba(255, 255, 255, 0.1);  line-height: 1.3;  margin: 1em;  -webkit-border-radius: 1em;          border-radius: 1em;  position: relative;}.iptv-playlist-item__body {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.iptv-playlist-item__url {  width: 60%;  padding-left: 1em;  overflow: hidden;  -o-text-overflow: ellipsis;     text-overflow: ellipsis;  white-space: nowrap;  text-align: right;}.iptv-playlist-item__title {  text-align: center;  padding: 1em;  font-size: 1.3em;}.iptv-playlist-item__name {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  width: 40%;}.iptv-playlist-item__name-ico {  background-color: #fff;  -webkit-border-radius: 0.5em;          border-radius: 0.5em;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  padding: 0.3em 0.5em;  color: #000;  min-width: 2.3em;  text-align: center;}.iptv-playlist-item__name-ico > span {  font-size: 1.2em;  font-weight: 900;}.iptv-playlist-item__name-text {  font-weight: 600;  padding-left: 1em;}.iptv-playlist-item__footer {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  margin-top: 1em;  -webkit-box-pack: justify;  -webkit-justify-content: space-between;      -ms-flex-pack: justify;          justify-content: space-between;}@media screen and (max-width: 480px) {  .iptv-playlist-item__footer {    display: block;  }}.iptv-playlist-item__details {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;}.iptv-playlist-item__details + div {  margin-left: 2em;}@media screen and (max-width: 480px) {  .iptv-playlist-item__details + div {    margin-left: 0em;    margin-top: 1em;  }}.iptv-playlist-item__label {  color: rgba(255, 255, 255, 0.5);}.iptv-playlist-item__label > span {  color: #fff;}.iptv-playlist-item__label + .iptv-playlist-item__label:before {  content: '|';  display: inline-block;  margin: 0 1em;  font-size: 0.7em;  margin-top: -0.4em;}.iptv-playlist-item.focus::after, .iptv-playlist-item.hover::after {  content: '';  position: absolute;  top: -0.5em;  left: -0.5em;  right: -0.5em;  bottom: -0.5em;  border: 0.3em solid #fff;  -webkit-border-radius: 1.4em;          border-radius: 1.4em;  z-index: -1;  pointer-events: none;}.iptv-content {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  padding: 0 1.5em;  line-height: 1.3;}.iptv-content > div {  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.iptv-content__menu {  width: 30%;  padding-right: 4em;}@media screen and (max-width: 900px) {  .iptv-content__menu {    width: 28%;  }}.iptv-content__channels {  width: 25%;}@media screen and (max-width: 900px) {  .iptv-content__channels {    width: 27%;  }}.iptv-content__details {  width: 45%;  padding-left: 4em;}.iptv-menu__head {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  margin-bottom: 2.4em;  -webkit-box-align: start;  -webkit-align-items: flex-start;      -ms-flex-align: start;          align-items: flex-start;}.iptv-menu__search {  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  padding: 0.5em;  margin-top: 0.6em;  margin-right: 0.6em;}.iptv-menu__search > svg {  width: 1.5em !important;  height: 1.5em !important;}.iptv-menu__search.focus {  -webkit-border-radius: 100%;          border-radius: 100%;  background-color: #fff;  color: #000;}.iptv-menu__search-mobile {  padding: 0.5em;}.iptv-menu__search-mobile > svg {  width: 1.5em !important;  height: 1.5em !important;}.iptv-menu__title {  font-size: 2.4em;  font-weight: 300;  padding-right: 1em;  margin-right: auto;}.iptv-menu__list-item {  font-size: 1.4em;  font-weight: 300;  position: relative;  padding: 0.5em 0.8em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  opacity: 0.6;}.iptv-menu__list-item > div {  word-break: break-all;}.iptv-menu__list-item-icon {  margin-right: 0.5em;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.iptv-menu__list-item-icon > svg {  width: 1em !important;  height: 1em !important;}.iptv-menu__list-item > span {  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  padding-left: 1em;  margin-left: auto;}.iptv-menu__list-item.active {  color: #fff;  background-color: rgba(255, 255, 255, 0.1);  -webkit-border-radius: 0.8em;          border-radius: 0.8em;  opacity: 1;}.iptv-menu__list-item.focus {  color: #000;  background-color: rgb(255, 255, 255);  -webkit-border-radius: 0.8em;          border-radius: 0.8em;  opacity: 1;}.iptv-menu__list > div + div {  margin-top: 0.3em;}.iptv-channels {  padding: 1em;  padding-left: 5em;}.iptv-channel {  background-color: #464646;  -webkit-border-radius: 1em;          border-radius: 1em;  padding-bottom: 72%;  position: relative;}.iptv-channel__body {  position: absolute;  top: 0;  left: 0;  right: 0;  bottom: 0;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-box-pack: center;  -webkit-justify-content: center;      -ms-flex-pack: center;          justify-content: center;  -webkit-box-orient: vertical;  -webkit-box-direction: normal;  -webkit-flex-direction: column;      -ms-flex-direction: column;          flex-direction: column;  padding: 1em;  text-align: center;}.iptv-channel__ico {  width: 80%;  opacity: 0;  max-height: 100%;}.iptv-channel__icons {  position: absolute;  top: 0.6em;  right: 0.6em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;}.iptv-channel__icons > svg {  width: 1.2em !important;  height: 1.2em !important;  margin-left: 0.5em;}.iptv-channel__name {  text-align: center;  font-size: 1.2em;  overflow: hidden;  display: -webkit-box;  -webkit-line-clamp: 1;  line-clamp: 1;  -webkit-box-orient: vertical;  max-height: 1.4em;}.iptv-channel__simb {  font-size: 4em;  font-weight: 900;  line-height: 0.7;  margin-bottom: 0.4em;}.iptv-channel__chn {  position: absolute;  top: 50%;  right: 100%;  margin-right: 0.5em;  font-size: 1.9em;  font-weight: 600;  margin-top: -0.7em;  opacity: 0.5;}.iptv-channel.loaded .iptv-channel__ico {  opacity: 1;}.iptv-channel.full--icon .iptv-channel__body {  padding: 0;  overflow: hidden;  -webkit-border-radius: 1em;          border-radius: 1em;}.iptv-channel.full--icon .iptv-channel__ico {  max-width: 105%;  width: 105%;  height: 105%;}.iptv-channel.small--icon .iptv-channel__ico {  width: 6em;  -webkit-border-radius: 0.7em;          border-radius: 0.7em;}.iptv-channel.favorite::after {  content: '';  position: absolute;  top: 0.3em;  right: 0.2em;  background-image: url(./img/icons/menu/like.svg);  background-repeat: no-repeat;  background-position: 50% 50%;  background-size: 55%;  -webkit-border-radius: 100%;          border-radius: 100%;  width: 1.8em;  height: 1.8em;  margin-left: -0.9em;}.iptv-channel.focus::before, .iptv-channel.active::before {  content: '';  position: absolute;  top: -0.5em;  left: -0.5em;  right: -0.5em;  bottom: -0.5em;  border: 0.3em solid #fff;  -webkit-border-radius: 1.4em;          border-radius: 1.4em;  opacity: 0.4;}.iptv-channel.focus::before {  opacity: 1;}.iptv-channel + .iptv-channel {  margin-top: 1em;}.iptv-channel--main {  width: 12.75em;  padding-bottom: 0;  height: 9em;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.iptv-channel--main + .iptv-channel {  margin-top: 0;  margin-left: 1em;}.iptv-details {  padding-top: 3.5em;  -webkit-mask-image: -webkit-gradient(linear, left top, left bottom, from(white), color-stop(92%, white), to(rgba(255, 255, 255, 0)));  -webkit-mask-image: -webkit-linear-gradient(top, white 0%, white 92%, rgba(255, 255, 255, 0) 100%);          mask-image: -webkit-gradient(linear, left top, left bottom, from(white), color-stop(92%, white), to(rgba(255, 255, 255, 0)));          mask-image: linear-gradient(to bottom, white 0%, white 92%, rgba(255, 255, 255, 0) 100%);}.iptv-details__play {  font-size: 1.3em;  margin-bottom: 0.5em;}.iptv-details__play .lb {  background: rgba(255, 255, 255, 0.3);  -webkit-border-radius: 0.2em;          border-radius: 0.2em;  padding: 0 0.4em;  margin-right: 0.7em;}.iptv-details__play span:last-child {  opacity: 0.5;}.iptv-details__title {  font-size: 3.3em;  font-weight: 700;}.iptv-details__program {  padding-top: 3em;}.iptv-details__list > div + div {  margin-top: 1.6em;}.iptv-details-epmty > div {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;}.iptv-details-epmty > div span {  background-color: rgba(255, 255, 255, 0.18);  -webkit-border-radius: 0.2em;          border-radius: 0.2em;  height: 1em;}.iptv-details-epmty > div span:first-child {  width: 8%;  margin-right: 3.2em;}.iptv-details-epmty > div + div {  margin-top: 2em;}.iptv-program {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  font-size: 1.2em;  font-weight: 300;  position: relative;}.iptv-program-date {  font-size: 1.2em;  padding-left: 4.9em;  margin-bottom: 1em;  opacity: 0.5;}.iptv-program__head {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.iptv-program__head-body {  -webkit-box-flex: 1;  -webkit-flex-grow: 1;      -ms-flex-positive: 1;          flex-grow: 1;  padding-left: 1em;}.iptv-program__title {  overflow: hidden;  -o-text-overflow: '.';     text-overflow: '.';  display: -webkit-box;  -webkit-line-clamp: 2;  line-clamp: 2;  -webkit-box-orient: vertical;}.iptv-program__icon-wrap {  width: 35%;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  -webkit-border-radius: 1em;          border-radius: 1em;  background-color: #464646;  position: relative;  padding-bottom: 25%;}.iptv-program__icon-wrap.loaded .iptv-program__icon-img {  opacity: 1;}.iptv-program__icon-img {  width: 100%;  height: 100%;  position: absolute;  top: 0;  left: 0;  opacity: 0;  -webkit-transition: opacity 0.1s;  -o-transition: opacity 0.1s;  transition: opacity 0.1s;  -webkit-border-radius: 1em;          border-radius: 1em;}.iptv-program__time {  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  width: 5em;  position: relative;}.iptv-program__descr {  opacity: 0.5;  margin-top: 0.7em;}.iptv-program__timeline {  -webkit-border-radius: 1em;          border-radius: 1em;  background: rgba(255, 255, 255, 0.1);  margin-top: 0.9em;}.iptv-program__timeline > div {  height: 0.1em;  -webkit-border-radius: 1em;          border-radius: 1em;  background: #fff;  min-height: 2px;}.iptv-program__body {  -webkit-box-flex: 1;  -webkit-flex-grow: 1;      -ms-flex-positive: 1;          flex-grow: 1;}.iptv-program.archive::after {  content: '';  position: absolute;  top: 0.2em;  left: 3.1em;  width: 1em;  height: 1em;  background: url('./img/icons/menu/time.svg') no-repeat 50% 50%;  background-size: contain;}.iptv-program.played::after {  content: '';  position: absolute;  top: 0.2em;  left: 3.1em;  width: 1em;  height: 1em;  background: url('./img/icons/player/play.svg') no-repeat 50% 50%;  background-size: contain;}.iptv-program.focus .iptv-program__time::after {  content: '';  position: absolute;  top: 0;  width: 2.4em;  left: 0em;  background-color: rgba(255, 255, 255, 0.2);  height: 1.4em;  -webkit-border-radius: 0.2em;          border-radius: 0.2em;}.iptv-hud {  position: absolute;  top: 0;  left: 0;  width: 100%;  height: 100%;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  line-height: 1.3;}.iptv-hud__content {  width: 100%;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  padding-left: 1.5em;  padding-right: 1.5em;  padding-top: 7em;  padding-bottom: 14em;}.iptv-hud__menu, .iptv-hud__program {  background-color: rgba(0, 0, 0, 0.6);  -webkit-border-radius: 0.5em;          border-radius: 0.5em;  padding: 1em;  overflow: hidden;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;}.iptv-hud__menu > div, .iptv-hud__program > div {  width: 100%;  overflow: hidden;}.iptv-hud__menu {  width: 22%;  margin-right: 1.5em;}.iptv-hud__program {  width: 40%;}.iptv-hud-menu-info {  margin-bottom: 1em;}.iptv-hud-menu-info__group {  opacity: 0.5;}.iptv-hud-menu-info__name {  line-height: 1.6;  font-size: 1.8em;}.iptv-hud-menu-button {  padding: 1em;  -webkit-border-radius: 0.3em;          border-radius: 0.3em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  background-color: rgba(255, 255, 255, 0.06);}.iptv-hud-menu-button__icon {  margin-right: 1em;}.iptv-hud-menu-button__icon > svg {  width: 1.6em !important;  height: 1.6em !important;}.iptv-hud-menu-button__icon .active-layer {  opacity: 0;}.iptv-hud-menu-button__text {  font-size: 1.3em;}.iptv-hud-menu-button.focus {  background-color: #fff;  color: #000;}.iptv-hud-menu-button.active .active-layer {  opacity: 1;}.iptv-hud-menu-button + .iptv-hud-menu-button {  margin-top: 0.5em;}.iptv-list-empty {  border: 0.2em dashed rgba(255, 255, 255, 0.5);  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-box-pack: center;  -webkit-justify-content: center;      -ms-flex-pack: center;          justify-content: center;  height: 12em;  -webkit-border-radius: 1em;          border-radius: 1em;}.iptv-link {  display: inline-block;  padding: 0.1em 0.5em;  -webkit-border-radius: 0.2em;          border-radius: 0.2em;  background-color: rgba(255, 255, 255, 0.1);}.iptv-param-lock {  position: absolute;  top: 50%;  right: 1.5em;  margin-top: -1em;  opacity: 0.5;}.iptv-param-lock > svg {  width: 2em;  height: 2em;}body.platform--orsay .iptv-menu__list-item {  padding-right: 2.7em;}body.platform--orsay .iptv-menu__list-item > span {  position: absolute;  top: 0.5em;  right: 1em;}body.light--version .iptv-content {  font-size: 0.9em;}body.light--version .iptv-channel {  -webkit-border-radius: 0.3em;          border-radius: 0.3em;}body.light--version .iptv-channel::before {  -webkit-border-radius: 0.6em;          border-radius: 0.6em;}.iptv-mobile .iptv-content {  display: block;  padding: 0;}.iptv-mobile .iptv-content__menu, .iptv-mobile .iptv-content__channels, .iptv-mobile .iptv-content__details {  width: 100%;  padding: 0;}.iptv-mobile .iptv-menu__list {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.iptv-mobile .iptv-menu__list > div + div {  margin: 0;  margin-left: 0.5em;}.iptv-mobile .iptv-menu__list-item {  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;}.iptv-mobile .iptv-menu__head {  display: none;}.iptv-mobile .iptv-channels {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  padding: 0;}.iptv-mobile .iptv-channel {  padding-bottom: 0;  -webkit-flex-shrink: 0;      -ms-flex-negative: 0;          flex-shrink: 0;  width: 14em;  height: 10em;}@media screen and (max-width: 400px) {  .iptv-mobile .iptv-channel {    width: 11em;    height: 8em;  }  .iptv-mobile .iptv-channel .iptv-channel__simb {    font-size: 3.2em;  }}.iptv-mobile .iptv-channel__chn {  display: none;}.iptv-mobile .iptv-channel + .iptv-channel {  margin: 0;  margin-left: 1em;}.iptv-mobile .iptv-content__details {  padding: 0 1.5em;}.iptv-mobile .iptv-details {  padding-top: 0;  height: 48vh;}@media screen and (max-width: 500px) {  .iptv-mobile .iptv-details__title {    font-size: 2.5em;  }}body.platform--browser .iptv-hud__menu,body.platform--browser .iptv-hud__program,body.platform--nw .iptv-hud__menu,body.platform--nw .iptv-hud__program {  background-color: rgba(0, 0, 0, 0.3);  -webkit-backdrop-filter: blur(1em);          backdrop-filter: blur(1em);}body.glass--style-opacity--medium .iptv-hud__menu,body.glass--style-opacity--medium .iptv-hud__program {  background-color: rgba(0, 0, 0, 0.6);}body.glass--style-opacity--blacked .iptv-hud__menu,body.glass--style-opacity--blacked .iptv-hud__program {  background-color: rgba(0, 0, 0, 0.85);}
        </style>
    `);
    }
    var Templates = {
      init: init$2
    };

    function init$1() {
      Lampa.Params.trigger("iptv_guide_update_after_start", false);
      Lampa.Params.trigger("iptv_guide_custom", false);
      Lampa.Params.select("iptv_guide_url", "", "");
      Lampa.Params.select("iptv_guide_interval", {
        "0": "#{iptv_param_guide_update_custom}",
        "1": "1",
        "2": "2",
        "3": "3",
        "5": "5",
        "8": "8",
        "12": "12",
        "18": "18",
        "24": "24 / 1",
        "48": "48 / 2",
        "72": "72 / 3",
        "96": "96 / 4",
        "120": "120 / 5",
        "144": "144 / 6",
        "168": "168 / 7"
      }, "24");
      Lampa.Params.select("iptv_guide_save", {
        "1": "1",
        "2": "2",
        "3": "3",
        "4": "4",
        "5": "5",
        "6": "6",
        "7": "7",
        "14": "14"
      }, "3");
      Lampa.Settings.listener.follow("open", function(e) {
        if (e.name == "iptv") {
          if (!Lampa.Account.hasPremium()) {
            let body = e.body.find(".scroll__body > div");
            let info = $(`<div class="settings-param selector" data-type="button" data-static="true">
                    <div class="settings-param__name">${Lampa.Lang.translate("account_premium_more")}</div>
                    <div class="settings-param__descr">${Lampa.Lang.translate("iptv_premium")}</div>
                </div>`);
            info.on("hover:enter", Lampa.Account.showCubPremium);
            body.prepend('<div class="settings-param-title"><span>' + Lampa.Lang.translate("title_settings") + "</span></div>");
            body.prepend(info);
          }
        }
        if (e.name == "iptv_guide") {
          let status = e.body.find(".update-guide-status");
          let parser = window.iptv_guide_update_process;
          let listen = () => {
            if (!parser) return;
            parser.follow("start", () => {
              status.find(".settings-param__name").text(Lampa.Lang.translate("iptv_guide_status_update"));
              status.find(".settings-param__value").text(Lampa.Lang.translate("iptv_guide_status_parsing") + " 0%");
            });
            parser.follow("percent", (data) => {
              status.find(".settings-param__value").text(Lampa.Lang.translate("iptv_guide_status_parsing") + " " + data.percent.toFixed(2) + "%");
            });
            parser.follow("finish", (data) => {
              status.find(".settings-param__name").text(Lampa.Lang.translate("iptv_guide_status_finish"));
              status.find(".settings-param__value").text(Lampa.Lang.translate("iptv_guide_status_channels") + " - " + data.count + ", " + Lampa.Lang.translate("iptv_guide_status_date") + " - " + Lampa.Utils.parseTime(data.time).briefly);
            });
            parser.follow("error", (data) => {
              status.find(".settings-param__name").text(Lampa.Lang.translate("title_error"));
              status.find(".settings-param__value").text(data.text);
            });
          };
          e.body.find(".update-guide-now").on("hover:enter", () => {
            if (window.iptv_guide_update_process) return Lampa.Noty.show(Lampa.Lang.translate("iptv_guide_status_update_wait"));
            Guide.update(status);
            parser = window.iptv_guide_update_process;
            listen();
          });
          let last_status = Lampa.Storage.get("iptv_guide_updated_status", "{}");
          if (last_status.type) {
            if (last_status.type == "error") {
              status.find(".settings-param__name").text(Lampa.Lang.translate("title_error"));
              status.find(".settings-param__value").text(last_status.text);
            }
            if (last_status.type == "finish") {
              status.find(".settings-param__value").text(Lampa.Lang.translate("iptv_guide_status_channels") + " - " + last_status.channels + ", " + Lampa.Lang.translate("iptv_guide_status_date") + " - " + Lampa.Utils.parseTime(last_status.time).briefly);
            }
          }
          if (parser) listen();
        }
      });
      Lampa.SettingsApi.addComponent({
        component: "iptv",
        icon: `<svg height="36" viewBox="0 0 38 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="8" width="34" height="21" rx="3" stroke="white" stroke-width="3"/>
            <line x1="13.0925" y1="2.34874" x2="16.3487" y2="6.90754" stroke="white" stroke-width="3" stroke-linecap="round"/>
            <line x1="1.5" y1="-1.5" x2="9.31665" y2="-1.5" transform="matrix(-0.757816 0.652468 0.652468 0.757816 26.197 2)" stroke="white" stroke-width="3" stroke-linecap="round"/>
            <line x1="9.5" y1="34.5" x2="29.5" y2="34.5" stroke="white" stroke-width="3" stroke-linecap="round"/>
        </svg>`,
        name: "IPTV"
      });
      if (Lampa.Manifest.app_digital >= 200) {
        Lampa.SettingsApi.addParam({
          component: "iptv",
          param: {
            type: "button"
          },
          field: {
            name: Lampa.Lang.translate("iptv_param_guide")
          },
          onChange: () => {
            Lampa.Settings.create("iptv_guide", {
              onBack: () => {
                Lampa.Settings.create("iptv");
              }
            });
          }
        });
      }
      Lampa.SettingsApi.addParam({
        component: "iptv",
        param: {
          type: "title"
        },
        field: {
          name: Lampa.Lang.translate("more")
        }
      });
      Lampa.SettingsApi.addParam({
        component: "iptv",
        param: {
          name: "iptv_view_in_main",
          type: "trigger",
          default: true
        },
        field: {
          name: Lampa.Lang.translate("iptv_param_view_in_main")
        }
      });
      Lampa.SettingsApi.addParam({
        component: "iptv",
        param: {
          name: "iptv_use_db",
          type: "select",
          values: {
            indexdb: "IndexedDB",
            storage: "LocalStorage"
          },
          default: "indexdb"
        },
        field: {
          name: Lampa.Lang.translate("iptv_param_use_db")
        },
        onChange: () => {
          Favorites.load().then(() => {
            document.querySelectorAll(".iptv-playlist-item").forEach((element) => {
              Lampa.Utils.trigger(element, "update");
            });
          });
        }
      });
      Lampa.SettingsApi.addParam({
        component: "iptv",
        param: {
          name: "iptv_favotite_save",
          type: "select",
          values: {
            url: "#{iptv_param_save_favorite_url}",
            name: "#{iptv_param_save_favorite_name}"
          },
          default: "url"
        },
        field: {
          name: Lampa.Lang.translate("iptv_param_save_favorite")
        }
      });
      Lampa.SettingsApi.addParam({
        component: "iptv",
        param: {
          name: "iptv_favotite_sort",
          type: "select",
          values: {
            add: "#{iptv_param_sort_add}",
            name: "#{iptv_param_sort_name}",
            view: "#{iptv_param_sort_view}"
          },
          default: "add"
        },
        field: {
          name: Lampa.Lang.translate("iptv_param_sort_favorite")
        },
        onRender: (item) => {
          if (!Lampa.Account.hasPremium()) {
            item.removeClass("selector");
            item.append(Lampa.Template.get("cub_iptv_param_lock"));
          }
        },
        onChange: () => {
        }
      });
    }
    var Settings = {
      init: init$1
    };

    function init() {
      let domain = Lampa.Manifest.cub_site || "cub.rip";
      Lampa.Lang.add({
        iptv_noprogram: {
          ru: "\u041D\u0435\u0442 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u044B",
          en: "No program",
          uk: "\u041D\u0435\u043C\u0430\u0454 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0438",
          be: "\u041D\u044F\u043C\u0430 \u043F\u0440\u0430\u0433\u0440\u0430\u043C\u044B",
          zh: "\u6CA1\u6709\u8282\u76EE",
          pt: "Nenhum programa",
          bg: "\u041D\u044F\u043C\u0430 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0438"
        },
        iptv_noload_playlist: {
          ru: "\u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E, \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430 \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0432\u0430\u0448 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043B \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0438\u0437 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432.",
          en: "Unfortunately, the playlist download failed. Your ISP may have blocked downloads from external sources.",
          uk: "\u041D\u0430 \u0436\u0430\u043B\u044C, \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430 \u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F. \u041C\u043E\u0436\u043B\u0438\u0432\u043E, \u0432\u0430\u0448 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 \u0437\u0430\u0431\u043B\u043E\u043A\u0443\u0432\u0430\u0432 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0456\u0437 \u0437\u043E\u0432\u043D\u0456\u0448\u043D\u0456\u0445 \u0434\u0436\u0435\u0440\u0435\u043B.",
          be: "\u041D\u0430\u0436\u0430\u043B\u044C, \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442\u0430 \u043D\u0435 \u0430\u0442\u0440\u044B\u043C\u0430\u043B\u0430\u0441\u044F. \u041C\u0430\u0433\u0447\u044B\u043C\u0430, \u0432\u0430\u0448 \u043F\u0440\u0430\u0432\u0430\u0439\u0434\u044D\u0440 \u0437\u0430\u0431\u043B\u0430\u043A\u0430\u0432\u0430\u045E \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0441\u0430 \u0437\u043D\u0435\u0448\u043D\u0456\u0445 \u043A\u0440\u044B\u043D\u0456\u0446.",
          zh: "\u4E0D\u5E78\u7684\u662F\uFF0C\u64AD\u653E\u5217\u8868\u4E0B\u8F7D\u5931\u8D25\u3002 \u60A8\u7684 ISP \u53EF\u80FD\u5DF2\u963B\u6B62\u4ECE\u5916\u90E8\u6765\u6E90\u4E0B\u8F7D\u3002",
          pt: "Infelizmente, o download da lista de reprodu\xE7\xE3o falhou. Seu ISP pode ter bloqueado downloads de fontes externas.",
          bg: "\u0417\u0430 \u0441\u044A\u0436\u0430\u043B\u0435\u043D\u0438\u0435, \u0441\u0432\u0430\u043B\u044F\u043D\u0435\u0442\u043E \u043D\u0430 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430\u0442\u0430 \u0441\u0435 \u043F\u0440\u043E\u0432\u0430\u043B\u0438. \u0412\u0430\u0448\u0438\u044F\u0442 \u0434\u043E\u0441\u0442\u0430\u0432\u0447\u0438\u043A \u043C\u043E\u0436\u0435 \u0434\u0430 \u0431\u043B\u043E\u043A\u0438\u0440\u0430 \u0441\u0432\u0430\u043B\u044F\u043D\u0435 \u043E\u0442 \u0432\u044A\u043D\u0448\u043D\u0438 \u0438\u0437\u0442\u043E\u0447\u043D\u0438\u0446\u0438."
        },
        iptv_select_playlist: {
          ru: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442",
          en: "Choose a playlist",
          uk: "\u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044C \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442",
          be: "\u0412\u044B\u0431\u0435\u0440\u044B\u0446\u0435 \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442",
          zh: "\u9009\u62E9\u4E00\u4E2A\u64AD\u653E\u5217\u8868",
          pt: "Escolha uma lista de reprodu\xE7\xE3o",
          bg: "\u0418\u0437\u0431\u0435\u0440\u0435\u0442\u0435 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442"
        },
        iptv_all_channels: {
          ru: "\u0412\u0441\u0435 \u043A\u0430\u043D\u0430\u043B\u044B",
          en: "All channels",
          uk: "\u0423\u0441\u0456 \u043A\u0430\u043D\u0430\u043B\u0438",
          be: "\u0423\u0441\u0435 \u043A\u0430\u043D\u0430\u043B\u044B",
          zh: "\u6240\u6709\u9891\u9053",
          pt: "Todos os canais",
          bg: "\u0412\u0441\u0438\u0447\u043A\u0438 \u043A\u0430\u043D\u0430\u043B\u0438"
        },
        iptv_add_fav: {
          ru: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435",
          en: "Add to favorites",
          uk: "\u0414\u043E\u0434\u0430\u0442\u0438 \u0432 \u043E\u0431\u0440\u0430\u043D\u0435",
          be: "\u0414\u0430\u0434\u0430\u0446\u044C \u0443 \u0430\u0431\u0440\u0430\u043D\u0430\u0435",
          zh: "\u6DFB\u52A0\u5230\u6536\u85CF\u5939",
          pt: "Adicionar aos favoritos",
          bg: "\u0414\u043E\u0431\u0430\u0432\u0438 \u0432 \u0438\u0437\u0431\u0440\u0430\u043D\u0438"
        },
        iptv_remove_fav: {
          ru: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E",
          en: "Remove from favorites",
          uk: "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437 \u0432\u0438\u0431\u0440\u0430\u043D\u043E\u0433\u043E",
          be: "\u041F\u0440\u044B\u0431\u0440\u0430\u0446\u044C \u0437 \u0430\u0431\u0440\u0430\u043D\u0430\u0433\u0430",
          zh: "\u4ECE\u6536\u85CF\u5939\u4E2D\u5220\u9664",
          pt: "Remover dos favoritos",
          bg: "\u041F\u0440\u0435\u043C\u0430\u0445\u043D\u0438 \u043E\u0442 \u0438\u0437\u0431\u0440\u0430\u043D\u0438"
        },
        iptv_playlist_empty: {
          ru: '\u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E, \u043D\u0430 \u0434\u0430\u043D\u043D\u044B\u0439 \u043C\u043E\u043C\u0435\u043D\u0442 \u0432\u044B \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u0438\u043B\u0438 \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430. \u0427\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0430, \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 <span class="iptv-link">' + domain + "/iptv</span> \u0438 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442.",
          en: `Sorry, you haven't added any playlist yet. To start watching content, please go to <span class="iptv-link">` + domain + "/iptv</span> and add at least one playlist.",
          uk: '\u041D\u0430 \u0436\u0430\u043B\u044C, \u043D\u0430 \u0434\u0430\u043D\u0438\u0439 \u043C\u043E\u043C\u0435\u043D\u0442 \u0432\u0438 \u043D\u0435 \u0434\u043E\u0434\u0430\u043B\u0438 \u0436\u043E\u0434\u043D\u043E\u0433\u043E \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430. \u0429\u043E\u0431 \u0440\u043E\u0437\u043F\u043E\u0447\u0430\u0442\u0438 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434 \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0443, \u0431\u0443\u0434\u044C \u043B\u0430\u0441\u043A\u0430, \u043F\u0435\u0440\u0435\u0439\u0434\u0456\u0442\u044C \u043D\u0430 \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0443 <span class="iptv-link">' + domain + "/iptv</span> \u0456 \u0434\u043E\u0434\u0430\u0439\u0442\u0435 \u0445\u043E\u0447\u0430 \u0431 \u043E\u0434\u0438\u043D \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442.",
          be: '\u041D\u0430\u0436\u0430\u043B\u044C, \u043D\u0430 \u0434\u0430\u0434\u0437\u0435\u043D\u044B \u043C\u043E\u043C\u0430\u043D\u0442 \u0432\u044B \u043D\u0435 \u0434\u0430\u0434\u0430\u043B\u0456 \u043D\u0456\u0432\u043E\u0434\u043D\u0430\u0433\u0430 \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442\u0430. \u041A\u0430\u0431 \u043F\u0430\u0447\u0430\u0446\u044C \u043F\u0440\u0430\u0433\u043B\u044F\u0434 \u043A\u0430\u043D\u0442\u044D\u043D\u0442\u0443, \u043A\u0430\u043B\u0456 \u043B\u0430\u0441\u043A\u0430, \u043F\u0435\u0440\u0430\u0439\u0434\u0437\u0456\u0446\u0435 \u043D\u0430 \u0441\u0442\u0430\u0440\u043E\u043D\u043A\u0443 <span class="iptv-link">' + domain + "/iptv</span> \u0456 \u0434\u0430\u0434\u0430\u0439\u0446\u0435 \u0445\u0430\u0446\u044F \u0431 \u0430\u0434\u0437\u0456\u043D \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442.",
          zh: '\u62B1\u6B49\uFF0C\u60A8\u8FD8\u6CA1\u6709\u6DFB\u52A0\u4EFB\u4F55\u64AD\u653E\u5217\u8868\u3002 \u8981\u5F00\u59CB\u89C2\u770B\u5185\u5BB9\uFF0C\u8BF7\u8F6C\u5230 <span class="iptv-link">' + domain + "/iptv</span> \u5E76\u6DFB\u52A0\u81F3\u5C11\u4E00\u4E2A\u64AD\u653E\u5217\u8868\u3002",
          pt: 'Desculpe, voc\xEA ainda n\xE3o adicionou nenhuma lista de reprodu\xE7\xE3o. Para come\xE7ar a assistir o conte\xFAdo, acesse <span class="iptv-link">' + domain + "/iptv</span> e adicione pelo menos uma lista de reprodu\xE7\xE3o.",
          bg: '\u0421\u044A\u0436\u0430\u043B\u044F\u0432\u0430\u043C, \u043E\u0449\u0435 \u043D\u0435 \u0441\u0442\u0435 \u0434\u043E\u0431\u0430\u0432\u0438\u043B\u0438 \u043D\u0438\u043A\u0430\u043A\u0432\u0430 \u043B\u0438\u0441\u0442\u0430. \u0417\u0430 \u0434\u0430 \u043F\u043E\u0447\u043D\u0435\u0442\u0435 \u0434\u0430 \u0433\u043B\u0435\u0434\u0430\u0442\u0435, \u043C\u043E\u043B\u044F \u0438\u0434\u0435\u0442\u0435 \u043D\u0430 <span class="iptv-link">' + domain + "/iptv</span> \u0438 \u0434\u043E\u0431\u0430\u0432\u0435\u0442\u0435 \u043F\u043E\u043D\u0435 \u0435\u0434\u043D\u0430 \u043B\u0438\u0441\u0442\u0430."
        },
        iptv_select_playlist_text: {
          ru: '\u0414\u043B\u044F \u0442\u043E\u0433\u043E \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0432\u043E\u0439 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442, \u0432\u0430\u043C \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 \u0441\u0430\u0439\u0442 <span class="iptv-link">' + domain + "/iptv</span> \u0438 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u043E\u0442 \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.",
          en: 'In order to add your playlist, you need to go to <span class="iptv-link">' + domain + "/iptv</span> and add a playlist from your provider.",
          uk: '\u0429\u043E\u0431 \u0434\u043E\u0434\u0430\u0442\u0438 \u0441\u0432\u0456\u0439 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442, \u0432\u0430\u043C \u043D\u0435\u043E\u0431\u0445\u0456\u0434\u043D\u043E \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 \u0441\u0430\u0439\u0442 <span class="iptv-link">' + domain + "/iptv</span> \u0456 \u0434\u043E\u0434\u0430\u0442\u0438 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u0432\u0456\u0434 \u0432\u0430\u0448\u043E\u0433\u043E \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.",
          be: '\u0414\u043B\u044F \u0442\u0430\u0433\u043E \u043A\u0430\u0431 \u0434\u0430\u0434\u0430\u0446\u044C \u0441\u0432\u043E\u0439 \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442, \u0432\u0430\u043C \u043D\u0435\u0430\u0431\u0445\u043E\u0434\u043D\u0430 \u043F\u0435\u0440\u0430\u0439\u0441\u0446\u0456 \u043D\u0430 \u0441\u0430\u0439\u0442 <span class="iptv-link">' + domain + "/iptv</span> \u0456 \u0434\u0430\u0434\u0430\u0446\u044C \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442 \u0430\u0434 \u0432\u0430\u0448\u0430\u0433\u0430 \u043F\u0440\u0430\u0432\u0430\u0439\u0434\u044D\u0440\u0430.",
          zh: '\u8981\u6DFB\u52A0\u60A8\u7684\u64AD\u653E\u5217\u8868\uFF0C\u60A8\u9700\u8981\u524D\u5F80 <span class="iptv-link">' + domain + "/iptv</span> \u5E76\u6DFB\u52A0\u6765\u81EA\u60A8\u7684\u63D0\u4F9B\u5546\u7684\u64AD\u653E\u5217\u8868\u3002",
          pt: 'Para adicionar sua lista de reprodu\xE7\xE3o, voc\xEA precisa acessar <span class="iptv-link">' + domain + "/iptv</span> e adicionar uma lista de reprodu\xE7\xE3o do seu provedor.",
          bg: '\u0417\u0430 \u0434\u0430 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0435 \u0432\u0430\u0448\u0430 \u043B\u0438\u0441\u0442\u0430, \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u043E\u0442\u0438\u0434\u0435\u0442\u0435 \u043D\u0430 <span class="iptv-link">' + domain + "/iptv</span> \u0438 \u0434\u0430 \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0435 \u043B\u0438\u0441\u0442\u0430 \u043E\u0442 \u0432\u0430\u0448\u0438\u044F\u0442 \u0434\u043E\u0441\u0442\u0430\u0432\u0447\u0438\u043A \u043D\u0430 \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u044F."
        },
        iptv_updated: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
          en: "Updated",
          uk: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
          be: "\u0410\u0431\u043D\u043E\u045E\u043B\u0435\u043D\u0430",
          zh: "\u66F4\u65B0",
          pt: "Atualizada",
          bg: "\u041E\u0431\u043D\u043E\u0432\u0435\u043D\u043E"
        },
        iptv_update: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435",
          en: "Update",
          uk: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
          be: "\u0410\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u0435",
          zh: "\u66F4\u65B0",
          pt: "Atualizar",
          bg: "\u041E\u0431\u043D\u043E\u0432\u044F\u0432\u0430\u043D\u0435"
        },
        iptv_active: {
          ru: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E",
          en: "Actively",
          uk: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E",
          be: "\u0410\u043A\u0442\u044B\u045E\u043D\u0430",
          zh: "\u79EF\u6781\u5730",
          pt: "Ativamente",
          bg: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E"
        },
        iptv_yesterday: {
          ru: "\u0412\u0447\u0435\u0440\u0430",
          en: "Yesterday",
          uk: "\u0412\u0447\u043E\u0440\u0430",
          be: "\u0423\u0447\u043E\u0440\u0430",
          zh: "\u6628\u5929",
          pt: "Ontem",
          bg: "\u0412\u0447\u0435\u0440\u0430"
        },
        iptv_today: {
          ru: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F",
          en: "Today",
          uk: "\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456",
          be: "\u0421\u0451\u043D\u043D\u044F",
          zh: "\u4ECA\u5929",
          pt: "Hoje",
          bg: "\u0414\u043D\u0435\u0441"
        },
        iptv_tomorrow: {
          ru: "\u0417\u0430\u0432\u0442\u0440\u0430",
          en: "Tomorrow",
          uk: "\u0417\u0430\u0432\u0442\u0440\u0430",
          be: "\u0417\u0430\u045E\u0442\u0440\u0430",
          zh: "\u660E\u5929",
          pt: "Amanh\xE3",
          bg: "\u0423\u0442\u0440\u0435"
        },
        iptv_loading: {
          ru: "\u041C\u0435\u0442\u043E\u0434 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
          en: "Download method",
          uk: "\u041C\u0435\u0442\u043E\u0434 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
          be: "\u041C\u0435\u0442\u0430\u0434 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0456",
          zh: "\u4E0B\u8F7D\u65B9\u5F0F",
          pt: "M\xE9todo de download",
          bg: "\u041C\u0435\u0442\u043E\u0434 \u043D\u0430 \u0437\u0430\u0440\u0435\u0436\u0434\u0430\u043D\u0435"
        },
        iptv_params_cub: {
          ru: "CUB",
          en: "CUB",
          uk: "CUB",
          be: "CUB",
          zh: "CUB",
          pt: "CUB",
          bg: "CUB"
        },
        iptv_params_lampa: {
          ru: "Lampa",
          en: "Lampa",
          uk: "Lampa",
          be: "Lampa",
          zh: "Lampa",
          pt: "Lampa",
          bg: "Lampa"
        },
        iptv_remove_cache: {
          ru: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u0435\u0448",
          en: "Delete cache",
          uk: "\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043A\u0435\u0448",
          be: "\u0412\u044B\u0434\u0430\u043B\u0456\u0446\u044C \u043A\u044D\u0448",
          zh: "\u5220\u9664\u7F13\u5B58",
          pt: "Excluir cache",
          bg: "\u0418\u0437\u0442\u0440\u0438\u0432\u0430\u043D\u0435 \u043D\u0430 \u043A\u0435\u0448"
        },
        iptv_remove_cache_descr: {
          ru: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u0438\u0437 \u043A\u0435\u0448\u0430",
          en: "Delete playlist from cache",
          uk: "\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u0437 \u043A\u0435\u0448\u0443",
          be: "\u0412\u044B\u0434\u0430\u043B\u0456\u0446\u044C \u043F\u043B\u044D\u0439\u043B\u0456\u0441\u0442 \u0437 \u043A\u044D\u0448\u0443",
          zh: "\u4ECE\u7F13\u5B58\u4E2D\u5220\u9664\u64AD\u653E\u5217\u8868",
          pt: "Excluir lista de reprodu\xE7\xE3o do cache",
          bg: "\u0418\u0437\u0442\u0440\u0438\u0439 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430 \u043E\u0442 \u043A\u0435\u0448\u0430"
        },
        iptv_params_always: {
          ru: "\u0412\u0441\u0435\u0433\u0434\u0430",
          en: "Always",
          uk: "\u0417\u0430\u0432\u0436\u0434\u0438",
          be: "\u0417\u0430\u045E\u0441\u0451\u0434\u044B",
          zh: "\u603B\u662F",
          pt: "Sempre",
          bg: "\u0412\u0438\u043D\u0430\u0433\u0438"
        },
        iptv_params_hour: {
          ru: "\u041A\u0430\u0436\u0434\u044B\u0439 \u0447\u0430\u0441",
          en: "Each hour",
          uk: "\u041A\u043E\u0436\u043D\u0443 \u0433\u043E\u0434\u0438\u043D\u0443",
          be: "\u041A\u043E\u0436\u043D\u0443\u044E \u0433\u0430\u0434\u0437\u0456\u043D\u0443",
          zh: "\u6BCF\u5C0F\u65F6",
          pt: "Cada hora",
          bg: "\u0412\u0441\u0435\u043A\u0438 \u0447\u0430\u0441"
        },
        iptv_params_hour12: {
          ru: "\u041A\u0430\u0436\u0434\u044B\u0435 12 \u0447\u0430\u0441\u043E\u0432",
          en: "Every 12 hours",
          uk: "\u041A\u043E\u0436\u043D\u0456 12 \u0433\u043E\u0434\u0438\u043D",
          be: "\u041A\u043E\u0436\u043D\u044B\u044F 12 \u0433\u0430\u0434\u0437\u0456\u043D",
          zh: "\u6BCF12\u5C0F\u65F6",
          pt: "A cada 12 horas",
          bg: "\u0412\u0441\u0435\u043A\u0438 12 \u0447\u0430\u0441\u0430"
        },
        iptv_params_day: {
          ru: "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E",
          en: "Daily",
          uk: "\u0429\u043E\u0434\u043D\u044F",
          be: "\u0428\u0442\u043E\u0434\u043D\u044F",
          zh: "\u65E5\u5E38\u7684",
          pt: "Di\xE1rio",
          bg: "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E"
        },
        iptv_params_week: {
          ru: "\u0415\u0436\u0435\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u043E",
          en: "Weekly",
          uk: "\u0429\u043E\u0442\u0438\u0436\u043D\u044F",
          be: "\u0428\u0442\u043E\u0442\u044B\u0434\u0437\u0435\u043D\u044C",
          zh: "\u6BCF\u5468",
          pt: "Semanalmente",
          bg: "\u0421\u0435\u0434\u043C\u0438\u0447\u043D\u043E"
        },
        iptv_params_none: {
          ru: "\u041D\u0438\u043A\u043E\u0433\u0434\u0430",
          en: "Never",
          uk: "\u041D\u0456\u043A\u043E\u043B\u0438",
          be: "\u041D\u0456\u043A\u043E\u043B\u0456",
          zh: "\u7EDD\u4E0D",
          pt: "Nunca",
          bg: "\u041D\u0438\u043A\u043E\u0433\u0430"
        },
        iptv_update_app_title: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
          en: "Update the app",
          uk: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0438",
          be: "\u0410\u0431\u043D\u0430\u0432\u0456\u0446\u0435 \u0434\u0430\u0434\u0430\u0442\u0430\u043A",
          zh: "\u66F4\u65B0\u5E94\u7528\u7A0B\u5E8F",
          pt: "Atualize o aplicativo",
          bg: "\u041E\u0431\u043D\u043E\u0432\u043D\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435"
        },
        iptv_update_app_text: {
          ru: "\u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E, \u0434\u043B\u044F \u0440\u0430\u0431\u043E\u0442\u044B \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0430\u0448\u0443 \u043B\u0430\u043C\u043F\u0443 \u043F\u0443\u0442\u0435\u043C \u0435\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438. \u041E\u043D\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0430 \u0438 \u0431\u0435\u0437 \u044D\u0442\u043E\u0439 \u043F\u0440\u043E\u0446\u0435\u0434\u0443\u0440\u044B \u043F\u043B\u0430\u0433\u0438\u043D \u043D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C.",
          en: "Unfortunately, for the plugin to work, you need to update your lamp by rebooting it. It is outdated and without this procedure the plugin will not function.",
          uk: "\u041D\u0430 \u0436\u0430\u043B\u044C, \u0434\u043B\u044F \u0440\u043E\u0431\u043E\u0442\u0438 \u043F\u043B\u0430\u0433\u0456\u043D\u0430 \u043D\u0435\u043E\u0431\u0445\u0456\u0434\u043D\u043E \u043E\u043D\u043E\u0432\u0438\u0442\u0438 \u043B\u0430\u043C\u043F\u0443 \u0448\u043B\u044F\u0445\u043E\u043C \u0457\u0457 \u043F\u0435\u0440\u0435\u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F. \u0412\u043E\u043D\u0430 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0430 \u0456 \u0431\u0435\u0437 \u0446\u0456\u0454\u0457 \u043F\u0440\u043E\u0446\u0435\u0434\u0443\u0440\u0438 \u043F\u043B\u0430\u0433\u0456\u043D \u043D\u0435 \u0444\u0443\u043D\u043A\u0446\u0456\u043E\u043D\u0443\u0432\u0430\u0442\u0438\u043C\u0435.",
          be: "\u041D\u0430\u0436\u0430\u043B\u044C, \u0434\u043B\u044F \u043F\u0440\u0430\u0446\u044B \u043F\u043B\u0430\u0433\u0456\u043D\u0430 \u043D\u0435\u0430\u0431\u0445\u043E\u0434\u043D\u0430 \u0430\u0431\u043D\u0430\u0432\u0456\u0446\u044C \u0432\u0430\u0448\u0443 \u043B\u044F\u043C\u043F\u0443 \u0448\u043B\u044F\u0445\u0430\u043C \u044F\u0435 \u043F\u0435\u0440\u0430\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0456. \u042F\u043D\u0430 \u0441\u0430\u0441\u0442\u0430\u0440\u044D\u043B\u0430\u044F \u0456 \u0431\u0435\u0437 \u0433\u044D\u0442\u0430\u0439 \u043F\u0440\u0430\u0446\u044D\u0434\u0443\u0440\u044B \u043F\u043B\u044F\u0433\u0456\u043D \u043D\u0435 \u0431\u0443\u0434\u0437\u0435 \u0444\u0443\u043D\u043A\u0446\u044B\u044F\u043D\u0430\u0432\u0430\u0446\u044C.",
          zh: "\u4E0D\u5E78\u7684\u662F\uFF0C\u8981\u4F7F\u63D2\u4EF6\u6B63\u5E38\u5DE5\u4F5C\uFF0C\u60A8\u9700\u8981\u901A\u8FC7\u91CD\u65B0\u542F\u52A8\u6765\u66F4\u65B0\u706F\u6CE1\u3002 \u5B83\u5DF2\u8FC7\u65F6\uFF0C\u5982\u679C\u6CA1\u6709\u6B64\u7A0B\u5E8F\uFF0C\u63D2\u4EF6\u5C06\u65E0\u6CD5\u8FD0\u884C\u3002",
          pt: "Infelizmente, para que o plug-in funcione, voc\xEA precisa atualizar sua l\xE2mpada reiniciando-a. Est\xE1 desatualizado e sem este procedimento o plugin n\xE3o funcionar\xE1.",
          bg: "\u0417\u0430 \u0441\u044A\u0436\u0430\u043B\u0435\u043D\u0438\u0435, \u0437\u0430 \u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u0438 \u0434\u043E\u0431\u0430\u0432\u043A\u0430, \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0432\u0430\u0448\u0430\u0442\u0430 Lampa \u0438 \u0434\u0430 \u044F \u0440\u0435\u0441\u0442\u0430\u0440\u0442\u0438\u0440\u0430\u0442\u0435. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u0442\u043E \u043D\u0435 \u0435 \u0430\u043A\u0442\u0443\u0430\u043B\u043D\u043E \u0438 \u0431\u0435\u0437 \u0442\u0430\u0437\u0438 \u043F\u0440\u043E\u0446\u0435\u0434\u0443\u0440\u0430 \u0434\u043E\u0431\u0430\u0432\u043A\u0430\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u0438"
        },
        iptv_param_sort_add: {
          ru: "\u041F\u043E \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044E",
          en: "By addition",
          uk: "\u0417\u0430 \u0434\u043E\u0434\u0430\u0432\u0430\u043D\u043D\u044F\u043C",
          be: "\u041F\u0430 \u0434\u0430\u0434\u0430\u043D\u043D\u0456",
          zh: "\u6309\u6DFB\u52A0\u65F6\u95F4",
          pt: "Por adi\xE7\xE3o",
          bg: "\u041F\u043E \u0434\u043E\u0431\u0430\u0432\u044F\u043D\u0435"
        },
        iptv_param_sort_name: {
          ru: "\u041F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E",
          en: "By name",
          uk: "\u0417\u0430 \u043D\u0430\u0437\u0432\u043E\u044E",
          be: "\u041F\u0430 \u043D\u0430\u0437\u0432\u0435",
          zh: "\u6309\u540D\u79F0",
          pt: "Por nome",
          bg: "\u041F\u043E \u0438\u043C\u0435"
        },
        iptv_param_sort_view: {
          ru: "\u041F\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430\u043C",
          en: "By views",
          uk: "\u0417\u0430 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0430\u043C\u0438",
          be: "\u041F\u0430 \u043F\u0440\u0430\u0433\u043B\u044F\u0434\u0430\u0445",
          zh: "\u6309\u89C2\u770B\u6B21\u6570",
          pt: "Por visualiza\xE7\xF5es",
          bg: "\u041F\u043E \u043F\u0440\u0435\u0433\u043B\u0435\u0434\u0438"
        },
        iptv_param_sort_favorite: {
          ru: "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435",
          en: "Sort by favorite",
          uk: "\u0421\u043E\u0440\u0442\u0443\u0432\u0430\u0442\u0438 \u0432 \u043E\u0431\u0440\u0430\u043D\u043E\u043C\u0443",
          be: "\u0421\u0430\u0440\u0442\u0430\u0432\u0430\u0446\u044C \u043F\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u044B\u043C",
          zh: "\u6309\u6536\u85CF\u6392\u5E8F",
          pt: "Classificar por favoritos",
          bg: "\u0421\u043E\u0440\u0442\u0438\u0440\u0430\u043D\u0435 \u043F\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u0438"
        },
        iptv_premium: {
          ru: "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u043D\u0435\u043A\u043E\u0442\u043E\u0440\u044B\u043C \u0444\u0443\u043D\u043A\u0446\u0438\u044F\u043C \u0432\u043E\u0437\u043C\u043E\u0436\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 \u043D\u0430\u043B\u0438\u0447\u0438\u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438 <b>CUB Premium</b>",
          en: "Some features are only available with a <b>CUB Premium</b> subscription",
          uk: "\u0414\u043E\u0441\u0442\u0443\u043F \u0434\u043E \u0434\u0435\u044F\u043A\u0438\u0445 \u0444\u0443\u043D\u043A\u0446\u0456\u0439 \u043C\u043E\u0436\u043B\u0438\u0432\u0438\u0439 \u043B\u0438\u0448\u0435 \u0437\u0430 \u043D\u0430\u044F\u0432\u043D\u043E\u0441\u0442\u0456 \u043F\u0435\u0440\u0435\u0434\u043F\u043B\u0430\u0442\u0438 <b>CUB Premium</b>",
          be: "\u0414\u043E\u0441\u0442\u0443\u043F \u0434\u0430 \u043D\u0435\u043A\u0430\u0442\u043E\u0440\u044B\u0445 \u0444\u0443\u043D\u043A\u0446\u044B\u0439 \u043C\u0430\u0433\u0447\u044B\u043C\u044B \u0442\u043E\u043B\u044C\u043A\u0456 \u043F\u0440\u044B \u043D\u0430\u044F\u045E\u043D\u0430\u0441\u0446\u0456 \u043F\u0430\u0434\u043F\u0456\u0441\u043A\u0456 <b>CUB Premium</b>",
          zh: "\u67D0\u4E9B\u529F\u80FD\u4EC5\u9002\u7528\u4E8E <b>CUB Premium</b> \u8BA2\u9605",
          pt: "Alguns recursos est\xE3o dispon\xEDveis apenas com uma assinatura <b>CUB Premium</b>",
          bg: "\u0414\u043E\u0441\u0442\u044A\u043F\u044A\u0442 \u0434\u043E \u043D\u044F\u043A\u043E\u0438 \u0444\u0443\u043D\u043A\u0446\u0438\u0438 \u0435 \u043D\u0430\u043B\u0438\u0447\u0435\u043D \u0441\u0430\u043C\u043E \u0447\u0440\u0435\u0437 <b>CUB Premium</b> \u0430\u0431\u043E\u043D\u0430\u043C\u0435\u043D\u0442"
        },
        iptv_param_save_favorite: {
          ru: "\u041C\u0435\u0442\u043E\u0434 \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E",
          en: "Favorite storage method",
          uk: "\u0421\u043F\u043E\u0441\u0456\u0431 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F \u043E\u0431\u0440\u0430\u043D\u043E\u0433\u043E",
          be: "\u041C\u0435\u0442\u0430\u0434 \u0437\u0430\u0445\u043E\u045E\u0432\u0430\u043D\u043D\u044F \u0430\u0431\u0440\u0430\u043D\u0430\u0433\u0430",
          zh: "\u6536\u85CF\u5B58\u50A8\u65B9\u6CD5",
          pt: "M\xE9todo de armazenamento favorito",
          bg: "\u041D\u0430\u0447\u0438\u043D \u043D\u0430 \u0441\u044A\u0440\u0445\u0430\u043D\u0435\u043D\u0438\u0435 \u043D\u0430 \u0444\u0430\u0432\u043E\u0440\u0438\u0442\u0438"
        },
        iptv_param_save_favorite_url: {
          ru: "\u041F\u043E \u0430\u0434\u0440\u0435\u0441\u0443 \u043A\u0430\u043D\u0430\u043B\u0430",
          en: "By channel URL",
          uk: "\u0417\u0430 URL-\u0430\u0434\u0440\u0435\u0441\u043E\u044E \u043A\u0430\u043D\u0430\u043B\u0443",
          be: "\u041F\u0430 URL-\u0430\u0434\u0440\u044D\u0441\u0435 \u043A\u0430\u043D\u0430\u043B\u0430",
          zh: "\u6309\u9891\u9053\u7F51\u5740",
          pt: "Por URL do canal",
          bg: "\u041F\u043E URL \u043D\u0430 \u043A\u0430\u043D\u0430\u043B\u0430"
        },
        iptv_param_save_favorite_name: {
          ru: "\u041F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u043A\u0430\u043D\u0430\u043B\u0430",
          en: "By channel name",
          uk: "\u0417\u0430 \u043D\u0430\u0437\u0432\u043E\u044E \u043A\u0430\u043D\u0430\u043B\u0443",
          be: "\u041F\u0430 \u043D\u0430\u0437\u0432\u0435 \u043A\u0430\u043D\u0430\u043B\u0430",
          zh: "\u6309\u9891\u9053\u540D\u79F0",
          pt: "Por nome do canal",
          bg: "\u041F\u043E \u0438\u043C\u0435 \u043D\u0430 \u043A\u0430\u043D\u0430\u043B\u0430"
        },
        iptv_param_use_db: {
          ru: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0431\u0430\u0437\u0443 \u0434\u0430\u043D\u043D\u044B\u0445",
          en: "Use database",
          uk: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u0442\u0438 \u0431\u0430\u0437\u0443 \u0434\u0430\u043D\u0438\u0445",
          be: "\u0412\u044B\u043A\u0430\u0440\u044B\u0441\u0442\u043E\u045E\u0432\u0430\u0446\u044C \u0431\u0430\u0437\u0443 \u0434\u0430\u0434\u0437\u0435\u043D\u044B\u0445",
          zh: "\u4F7F\u7528\u6570\u636E\u5E93",
          pt: "Utilizar banco de dados",
          bg: "\u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u043A\u0438 \u0431\u0430\u0437\u0430 \u0434\u0430\u043D\u043D\u0438"
        },
        iptv_param_guide: {
          ru: "\u0422\u0435\u043B\u0435\u0433\u0438\u0434",
          en: "TV Guide",
          uk: "\u0422\u0435\u043B\u0435\u0433\u0456\u0434",
          be: "\u0422\u044D\u043B\u0435\u0433\u0456\u0434",
          zh: "\u7535\u89C6\u6307\u5357",
          pt: "Guia de TV",
          bg: "\u0422\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u043E\u043D\u0435\u043D \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A"
        },
        iptv_search_no_result: {
          ru: "\u041D\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443",
          en: "No results found",
          uk: "\u041D\u0435\u043C\u0430\u0454 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0456\u0432 \u0437\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C",
          be: "\u041D\u044F\u043C\u0430 \u0432\u044B\u043D\u0456\u043A\u0430\u045E \u043F\u0430 \u0437\u0430\u043F\u044B\u0446\u0435",
          zh: "\u672A\u627E\u5230\u7ED3\u679C",
          pt: "Nenhum resultado encontrado",
          bg: "\u041D\u044F\u043C\u0430 \u043D\u0430\u043C\u0435\u0440\u0435\u043D\u0438 \u0440\u0435\u0437\u0443\u043B\u0442\u0430\u0442\u0438"
        },
        iptv_guide_status_update_wait: {
          ru: "\u0418\u0434\u0435\u0442 \u043F\u0440\u043E\u0446\u0435\u0441\u0441 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435...",
          en: "Updating process in progress, please wait...",
          uk: "\u0419\u0434\u0435 \u043F\u0440\u043E\u0446\u0435\u0441 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F, \u0437\u0430\u0447\u0435\u043A\u0430\u0439\u0442\u0435...",
          be: "\u0406\u0434\u0437\u0435 \u043F\u0440\u0430\u0446\u044D\u0441 \u0430\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u044F, \u043A\u0430\u043B\u0456 \u043B\u0430\u0441\u043A\u0430, \u043F\u0430\u0447\u0430\u043A\u0430\u0439\u0446\u0435...",
          zh: "\u66F4\u65B0\u8FC7\u7A0B\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u7B49...",
          pt: "Processo de atualiza\xE7\xE3o em andamento, aguarde...",
          bg: "\u041F\u0440\u043E\u0446\u0435\u0441\u044A\u0442 \u043D\u0430 \u0430\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u0435 \u0432 \u0445\u043E\u0434, \u043C\u043E\u043B\u044F \u0438\u0437\u0447\u0430\u043A\u0430\u0439\u0442\u0435..."
        },
        iptv_guide_status_update: {
          ru: "\u0418\u0434\u0435\u0442 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435",
          en: "Update in progress",
          uk: "\u0419\u0434\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
          be: "\u0406\u0434\u0437\u0435 \u0430\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u0435",
          zh: "\u66F4\u65B0\u8FDB\u884C\u4E2D",
          pt: "Atualiza\xE7\xE3o em andamento",
          bg: "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u0432 \u0445\u043E\u0434"
        },
        iptv_guide_status_parsing: {
          ru: "\u041F\u0430\u0440\u0441\u0438\u043D\u0433",
          en: "Parsing",
          uk: "\u0410\u043D\u0430\u043B\u0456\u0437",
          be: "\u0410\u043D\u0430\u043B\u0456\u0437",
          zh: "\u89E3\u6790\u4E2D",
          pt: "Analisando",
          bg: "\u0410\u043D\u0430\u043B\u0438\u0437"
        },
        iptv_guide_status_finish: {
          ru: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
          en: "Status of the last update",
          uk: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0441\u0442\u0430\u043D\u043D\u044C\u043E\u0433\u043E \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
          be: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0430\u043F\u043E\u0448\u043D\u044F\u0433\u0430 \u0430\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u044F",
          zh: "\u6700\u540E\u66F4\u65B0\u72B6\u6001",
          pt: "Estado da \xFAltima atualiza\xE7\xE3o",
          bg: "\u0421\u044A\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u043E\u0442\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435"
        },
        iptv_guide_status_channels: {
          ru: "\u041A\u0430\u043D\u0430\u043B\u043E\u0432",
          en: "Channels",
          uk: "\u041A\u0430\u043D\u0430\u043B\u0456\u0432",
          be: "\u041A\u0430\u043D\u0430\u043B\u0430\u045E",
          zh: "\u9891\u9053",
          pt: "Canais",
          bg: "\u041A\u0430\u043D\u0430\u043B\u0438"
        },
        iptv_guide_status_date: {
          ru: "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
          en: "updated",
          uk: "\u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
          be: "\u0430\u0431\u043D\u043E\u045E\u043B\u0435\u043D\u0430",
          zh: "\u5DF2\u66F4\u65B0",
          pt: "atualizado",
          bg: "\u043E\u0431\u043D\u043E\u0432\u0435\u043D\u043E"
        },
        iptv_guide_status_noupdates: {
          ru: "\u0415\u0449\u0435 \u043D\u0435\u0442 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439",
          en: "No updates yet",
          uk: "\u0429\u0435 \u043D\u0435\u043C\u0430\u0454 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u044C",
          be: "\u042F\u0448\u0447\u044D \u043D\u044F\u043C\u0430 \u0430\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u044F\u045E",
          zh: "\u6682\u65E0\u66F4\u65B0",
          pt: "Ainda sem atualiza\xE7\xF5es",
          bg: "\u0412\u0441\u0435 \u043E\u0449\u0435 \u043D\u044F\u043C\u0430 \u0430\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438"
        },
        iptv_guide_error_link: {
          ru: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0438\u0434",
          en: "Specify the TV guide link",
          uk: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0456\u0434",
          be: "\u041F\u0430\u043A\u0430\u0436\u044B\u0446\u0435 \u0441\u043F\u0430\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u044D\u043B\u0435\u0433\u0456\u0434",
          zh: "\u8BF7\u6307\u5B9A\u7535\u89C6\u6307\u5357\u94FE\u63A5",
          pt: "Indique o link do guia de TV",
          bg: "\u041F\u043E\u0441\u043E\u0447\u0435\u0442\u0435 \u0432\u0440\u044A\u0437\u043A\u0430\u0442\u0430 \u043A\u044A\u043C \u0442\u0435\u043B\u0435\u0433\u0438\u0434\u0430"
        },
        iptv_param_guide_custom_title: {
          ru: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0441\u0432\u043E\u044E \u0441\u0441\u044B\u043B\u043A\u0443",
          en: "Use your own link",
          uk: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0439\u0442\u0435 \u0441\u0432\u043E\u0454 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F",
          be: "\u0412\u044B\u043A\u0430\u0440\u044B\u0441\u0442\u043E\u045E\u0432\u0430\u0439\u0446\u0435 \u0441\u0432\u0430\u044E \u0441\u043F\u0430\u0441\u044B\u043B\u043A\u0443",
          zh: "\u4F7F\u7528\u60A8\u81EA\u5DF1\u7684\u94FE\u63A5",
          pt: "Use seu pr\xF3prio link",
          bg: "\u0418\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0439\u0442\u0435 \u0441\u0432\u043E\u044F\u0442\u0430 \u0432\u0440\u044A\u0437\u043A\u0430"
        },
        iptv_param_guide_custom_descr: {
          ru: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u0432\u043E\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0438\u0434, \u0435\u0441\u043B\u0438 \u043D\u0435 \u0445\u043E\u0442\u0438\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043B\u0435\u0433\u0438\u0434 \u043E\u0442 CUB",
          en: "Specify your TV guide link if you do not want to use the CUB TV guide",
          uk: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u0441\u0432\u043E\u0454 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0456\u0434, \u044F\u043A\u0449\u043E \u0432\u0438 \u043D\u0435 \u0445\u043E\u0447\u0435\u0442\u0435 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u0442\u0438 \u0442\u0435\u043B\u0435\u0433\u0456\u0434 \u0432\u0456\u0434 CUB",
          be: "\u041F\u0430\u043A\u0430\u0436\u044B\u0446\u0435 \u0441\u0432\u0430\u044E \u0441\u043F\u0430\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u044D\u043B\u0435\u0433\u0456\u0434, \u043A\u0430\u043B\u0456 \u0432\u044B \u043D\u0435 \u0445\u043E\u0447\u0430\u0446\u0435 \u0432\u044B\u043A\u0430\u0440\u044B\u0441\u0442\u043E\u045E\u0432\u0430\u0446\u044C \u0442\u044D\u043B\u0435\u0433\u0456\u0434 \u0430\u0434 CUB",
          zh: "\u5982\u679C\u60A8\u4E0D\u60F3\u4F7F\u7528CUB\u7535\u89C6\u6307\u5357\uFF0C\u8BF7\u6307\u5B9A\u60A8\u7684\u7535\u89C6\u6307\u5357\u94FE\u63A5",
          pt: "Especifique seu link do guia de TV se n\xE3o quiser usar o guia de TV da CUB",
          bg: "\u0423\u0442\u043E\u0447\u043D\u0435\u0442\u0435 \u0441\u0432\u043E\u044F\u0442\u0430 \u0432\u0440\u044A\u0437\u043A\u0430 \u043A\u044A\u043C \u0442\u0435\u043B\u0435\u0433\u0438\u0434\u0430, \u0430\u043A\u043E \u043D\u0435 \u0438\u0441\u043A\u0430\u0442\u0435 \u0434\u0430 \u0438\u0437\u043F\u043E\u043B\u0437\u0432\u0430\u0442\u0435 \u0442\u043E\u0437\u0438 \u043D\u0430 CUB"
        },
        iptv_param_guide_url_descr: {
          ru: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u0432\u043E\u044E \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0438\u0434 EPG",
          en: "Specify your EPG TV guide link",
          uk: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u0441\u0432\u043E\u0454 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u043D\u0430 \u0442\u0435\u043B\u0435\u0433\u0456\u0434 EPG",
          be: "\u041F\u0430\u043A\u0430\u0436\u044B\u0446\u0435 \u0441\u0432\u0430\u044E \u0441\u043F\u0430\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0442\u044D\u043B\u0435\u0433\u0456\u0434 EPG",
          zh: "\u8BF7\u6307\u5B9A\u60A8\u7684\u7535\u89C6\u6307\u5357EPG\u94FE\u63A5",
          pt: "Especifique seu link do guia de TV EPG",
          bg: "\u0423\u0442\u043E\u0447\u043D\u0435\u0442\u0435 \u0441\u0432\u043E\u044F\u0442\u0430 \u0432\u0440\u044A\u0437\u043A\u0430 \u043A\u044A\u043C \u0442\u0435\u043B\u0435\u0433\u0438\u0434\u0430 EPG"
        },
        iptv_param_guide_interval_title: {
          ru: "\u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
          en: "Update Interval",
          uk: "\u0406\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F",
          be: "\u0406\u043D\u0442\u044D\u0440\u0432\u0430\u043B \u0430\u0431\u043D\u0430\u045E\u043B\u0435\u043D\u043D\u044F",
          zh: "\u66F4\u65B0\u95F4\u9694",
          pt: "Intervalo de atualiza\xE7\xE3o",
          bg: "\u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u0437\u0430 \u0430\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F"
        },
        iptv_param_guide_interval_descr: {
          ru: "\u0427\u0435\u0440\u0435\u0437 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0447\u0430\u0441\u043E\u0432 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0442\u044C \u0442\u0435\u043B\u0435\u0433\u0438\u0434",
          en: "How many hours to update the TV guide",
          uk: "\u0427\u0435\u0440\u0435\u0437 \u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0433\u043E\u0434\u0438\u043D \u043E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u0442\u0438 \u0442\u0435\u043B\u0435\u0433\u0456\u0434",
          be: "\u041F\u0440\u0430\u0437 \u043A\u043E\u043B\u044C\u043A\u0456 \u0433\u0430\u0434\u0437\u0456\u043D \u0430\u0431\u043D\u0430\u045E\u043B\u044F\u0446\u044C \u0442\u044D\u043B\u0435\u0433\u0456\u0434",
          zh: "\u591A\u5C11\u5C0F\u65F6\u66F4\u65B0\u7535\u89C6\u6307\u5357",
          pt: "Quantas horas para atualizar o guia de TV",
          bg: "\u041F\u0440\u0435\u0437 \u043A\u043E\u043B\u043A\u043E \u0447\u0430\u0441\u0430 \u0434\u0430 \u0430\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u0430 \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u043E\u043D\u043D\u0438\u044F \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A"
        },
        iptv_param_guide_update_after_start: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F",
          en: "Update on application startup",
          uk: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0443 \u0434\u043E\u0434\u0430\u0442\u043A\u0430",
          be: "\u0410\u0431\u043D\u0430\u0432\u0456\u0446\u044C \u043F\u0440\u044B \u0437\u0430\u043F\u0443\u0441\u043A\u0443 \u043F\u0440\u044B\u043A\u043B\u0430\u0434\u0430\u043D\u043D\u044F",
          zh: "\u542F\u52A8\u5E94\u7528\u65F6\u66F4\u65B0",
          pt: "Atualizar ao iniciar o aplicativo",
          bg: "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0438\u0440\u0430\u043D\u0435 \u043D\u0430 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u0442\u043E"
        },
        iptv_param_guide_update_now: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0442\u0435\u043B\u0435\u0433\u0438\u0434",
          en: "Update TV Guide Now",
          uk: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438 \u0442\u0435\u043B\u0435\u0433\u0456\u0434 \u0437\u0430\u0440\u0430\u0437",
          be: "\u0410\u0431\u043D\u0430\u0432\u0456\u0446\u044C \u0442\u044D\u043B\u0435\u0433\u0456\u0434 \u0437\u0430\u0440\u0430\u0437",
          zh: "\u7ACB\u5373\u66F4\u65B0\u7535\u89C6\u6307\u5357",
          pt: "Atualizar guia de TV agora",
          bg: "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u0430\u0439\u0442\u0435 \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u043E\u043D\u043D\u0438\u044F \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u0441\u0435\u0433\u0430"
        },
        iptv_param_guide_save_title: {
          ru: "\u0427\u0438\u0441\u043B\u043E \u0434\u043D\u0435\u0439 \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
          en: "Number of Days to Keep",
          uk: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u0434\u043D\u0456\u0432 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F",
          be: "\u041A\u043E\u043B\u044C\u043A\u0430\u0441\u0446\u044C \u0434\u0437\u0451\u043D \u0437\u0430\u0445\u043E\u045E\u0432\u0430\u043D\u043D\u044F",
          zh: "\u4FDD\u5B58\u5929\u6570",
          pt: "N\xFAmero de dias para manter",
          bg: "\u0411\u0440\u043E\u0439 \u0434\u043D\u0438 \u0437\u0430 \u0437\u0430\u043F\u0430\u0437\u0432\u0430\u043D\u0435"
        },
        iptv_param_guide_save_descr: {
          ru: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u043D\u0435\u0439 \u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0442\u0435\u043B\u0435\u0433\u0438\u0434 \u0432 \u043A\u044D\u0448\u0435",
          en: "How many days to keep the TV guide in the cache",
          uk: "\u0421\u043A\u0456\u043B\u044C\u043A\u0438 \u0434\u043D\u0456\u0432 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0442\u0438 \u0442\u0435\u043B\u0435\u0433\u0456\u0434 \u0443 \u043A\u0435\u0448\u0456",
          be: "\u041A\u043E\u043B\u044C\u043A\u0456 \u0434\u0437\u0451\u043D \u0437\u0430\u0445\u043E\u045E\u0432\u0430\u0446\u044C \u0442\u044D\u043B\u0435\u0433\u0456\u0434 \u0443 \u043A\u044D\u0448\u044B",
          zh: "\u5728\u7F13\u5B58\u4E2D\u4FDD\u5B58\u591A\u5C11\u5929\u7684\u7535\u89C6\u6307\u5357",
          pt: "Quantos dias manter o guia de TV no cache",
          bg: "\u0417\u0430 \u043A\u043E\u043B\u043A\u043E \u0434\u043D\u0438 \u0434\u0430 \u0441\u0435 \u0437\u0430\u043F\u0430\u0437\u0438 \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u043E\u043D\u043D\u0438\u044F \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A \u0432 \u043A\u0435\u0448\u0430"
        },
        iptv_param_guide_update_custom: {
          ru: "\u0412\u0440\u0443\u0447\u043D\u0443\u044E",
          en: "Manual",
          uk: "\u0412\u0440\u0443\u0447\u043D\u0443",
          be: "\u0410\u0434\u0437\u0456\u043D\u0430\u0447\u043A\u0443",
          zh: "\u624B\u52A8",
          pt: "Manual",
          bg: "\u0420\u044A\u0447\u043D\u043E"
        },
        iptv_need_update_app: {
          ru: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0438",
          en: "Update the application to the latest version",
          uk: "\u041E\u043D\u043E\u0432\u0456\u0442\u044C \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0443 \u0434\u043E \u043E\u0441\u0442\u0430\u043D\u043D\u044C\u043E\u0457 \u0432\u0435\u0440\u0441\u0456\u0457",
          be: "\u0410\u0431\u043D\u043E\u0432\u0456\u0446\u0435 \u043F\u0440\u044B\u043A\u043B\u0430\u0434\u0430\u043D\u043D\u0435 \u0434\u0430 \u0430\u043F\u043E\u0448\u043D\u044F\u0439 \u0432\u0435\u0440\u0441\u0456\u0456",
          zh: "\u5347\u7EA7\u5E94\u7528\u7A0B\u5E8F\u5230\u6700\u65B0\u7248\u672C",
          pt: "Atualize o aplicativo para a vers\xE3o mais recente",
          bg: "\u0410\u043A\u0442\u0443\u0430\u043B\u0438\u0437\u0438\u0440\u0430\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u0442\u043E \u0434\u043E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0430\u0442\u0430 \u0432\u0435\u0440\u0441\u0438\u044F"
        },
        iptv_channel_lock: {
          ru: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
          en: "Lock",
          uk: "\u0417\u0430\u0431\u043B\u043E\u043A\u0443\u0432\u0430\u0442\u0438",
          be: "\u0417\u0430\u0431\u043B\u0430\u043A\u0430\u0432\u0430\u0446\u044C",
          zh: "\u9501\u5B9A",
          pt: "Bloquear",
          bg: "\u0417\u0430\u043A\u043B\u044E\u0447\u0432\u0430\u043D\u0435"
        },
        iptv_channel_unlock: {
          ru: "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
          en: "Unlock",
          uk: "\u0420\u043E\u0437\u0431\u043B\u043E\u043A\u0443\u0432\u0430\u0442\u0438",
          be: "\u0420\u0430\u0437\u0431\u043B\u0430\u043A\u0430\u0432\u0430\u0446\u044C",
          zh: "\u89E3\u9501",
          pt: "Desbloquear",
          bg: "\u041E\u0442\u043A\u043B\u044E\u0447\u0432\u0430\u043D\u0435"
        },
        iptv_about_text: {
          ru: "\u0423\u0434\u043E\u0431\u043D\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 IPTV \u2013 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u043C\u043D\u043E\u0436\u0435\u0441\u0442\u0432\u0443 \u043A\u0430\u043D\u0430\u043B\u043E\u0432, \u0444\u0438\u043B\u044C\u043C\u0430\u043C \u0438 \u0441\u0435\u0440\u0438\u0430\u043B\u0430\u043C \u043F\u0440\u044F\u043C\u043E \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u043E\u0440\u0435. \u0418\u043D\u0442\u0443\u0438\u0442\u0438\u0432\u043D\u044B\u0439 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441, \u043B\u0435\u0433\u043A\u0430\u044F \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F, \u0438 \u0431\u0435\u0437\u0433\u0440\u0430\u043D\u0438\u0447\u043D\u044B\u0435 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u0440\u0430\u0437\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u0439 \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u043C \u044D\u043A\u0440\u0430\u043D\u0435. \u0412\u0430\u0448 \u043B\u0438\u0447\u043D\u044B\u0439 \u043F\u043E\u0440\u0442\u0430\u043B \u0432 \u043C\u0438\u0440 \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0433\u043E \u0442\u0435\u043B\u0435\u0432\u0438\u0434\u0435\u043D\u0438\u044F!",
          en: "Convenient IPTV application - access a variety of channels, movies, and series directly on your television. Intuitive interface, easy navigation, and unlimited entertainment possibilities on your big screen. Your personal portal to the world of digital television!",
          uk: "\u0417\u0440\u0443\u0447\u043D\u0438\u0439 \u0434\u043E\u0434\u0430\u0442\u043E\u043A IPTV - \u043E\u0442\u0440\u0438\u043C\u0430\u0439\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u0434\u043E \u0431\u0435\u0437\u043B\u0456\u0447\u0456 \u043A\u0430\u043D\u0430\u043B\u0456\u0432, \u0444\u0456\u043B\u044C\u043C\u0456\u0432 \u0456 \u0441\u0435\u0440\u0456\u0430\u043B\u0456\u0432 \u043F\u0440\u044F\u043C\u043E \u043D\u0430 \u0432\u0430\u0448\u043E\u043C\u0443 \u0442\u0435\u043B\u0435\u0432\u0456\u0437\u043E\u0440\u0456. \u0406\u043D\u0442\u0443\u0457\u0442\u0438\u0432\u043D\u0438\u0439 \u0456\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441, \u043B\u0435\u0433\u043A\u0430 \u043D\u0430\u0432\u0456\u0433\u0430\u0446\u0456\u044F \u0442\u0430 \u043D\u0435\u043E\u0431\u043C\u0435\u0436\u0435\u043D\u0456 \u043C\u043E\u0436\u043B\u0438\u0432\u043E\u0441\u0442\u0456 \u0440\u043E\u0437\u0432\u0430\u0433 \u043D\u0430 \u0432\u0430\u0448\u043E\u043C\u0443 \u0432\u0435\u043B\u0438\u043A\u043E\u043C\u0443 \u0435\u043A\u0440\u0430\u043D\u0456. \u0412\u0430\u0448 \u043E\u0441\u043E\u0431\u0438\u0441\u0442\u0438\u0439 \u043F\u043E\u0440\u0442\u0430\u043B \u0443 \u0441\u0432\u0456\u0442 \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0433\u043E \u0442\u0435\u043B\u0435\u0431\u0430\u0447\u0435\u043D\u043D\u044F!",
          be: "\u0417\u0440\u0443\u0447\u043D\u0430\u0435 \u043F\u0440\u044B\u043A\u043B\u0430\u0434\u0430\u043D\u043D\u0435 IPTV - \u0430\u0442\u0440\u044B\u043C\u0430\u0439\u0446\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u0434\u0430 \u0448\u043C\u0430\u0442\u043B\u0456\u043A\u0430\u043D\u0430\u043B\u044C\u043D\u0430\u0433\u0430 \u0442\u044D\u043B\u0435\u0431\u0430\u0447\u0430\u043D\u043D\u044F, \u0444\u0456\u043B\u044C\u043C\u0430\u045E \u0456 \u0441\u0435\u0440\u044B\u044F\u043B\u0430\u045E \u043F\u0440\u043E\u0441\u0442\u0430 \u043D\u0430 \u0432\u0430\u0448\u044B\u043C \u0442\u044D\u043B\u0435\u0432\u0456\u0437\u0430\u0440\u044B. \u0406\u043D\u0442\u0443\u0456\u0442\u044B\u045E\u043D\u044B \u0456\u043D\u0442\u044D\u0440\u0444\u0435\u0439\u0441, \u043B\u0451\u0433\u043A\u0430\u044F \u043D\u0430\u0432\u0456\u0433\u0430\u0446\u044B\u044F \u0456 \u043D\u0435\u0430\u0431\u043C\u0435\u0436\u0430\u0432\u0430\u043D\u044B\u044F \u043C\u0430\u0433\u0447\u044B\u043C\u0430\u0441\u0446\u0456 \u0440\u0430\u0437\u0432\u0430\u0433 \u043D\u0430 \u0432\u0430\u0448\u044B\u043C \u0432\u044F\u043B\u0456\u043A\u0456\u043C \u044D\u043A\u0440\u0430\u043D\u0435. \u0412\u0430\u0448 \u0430\u0441\u0430\u0431\u0456\u0441\u0442\u044B \u043F\u0430\u0440\u0442\u0430\u043B \u0443 \u0441\u0432\u0435\u0442 \u0446\u044B\u0444\u0440\u0430\u0432\u0430\u0433\u0430 \u0442\u044D\u043B\u0435\u0431\u0430\u0447\u0430\u043D\u043D\u044F!",
          zh: "\u65B9\u4FBF\u7684IPTV\u5E94\u7528\u7A0B\u5E8F-\u76F4\u63A5\u5728\u60A8\u7684\u7535\u89C6\u4E0A\u8BBF\u95EE\u5404\u79CD\u9891\u9053\uFF0C\u7535\u5F71\u548C\u7CFB\u5217\u3002\u76F4\u89C2\u7684\u754C\u9762\uFF0C\u7B80\u5355\u7684\u5BFC\u822A\u4EE5\u53CA\u5728\u60A8\u7684\u5927\u5C4F\u5E55\u4E0A\u65E0\u9650\u7684\u5A31\u4E50\u53EF\u80FD\u6027\u3002\u60A8\u6570\u5B57\u7535\u89C6\u4E16\u754C\u7684\u4E2A\u4EBA\u95E8\u6237\uFF01",
          pt: "Aplicativo IPTV conveniente - acesse uma variedade de canais, filmes e s\xE9ries diretamente na sua televis\xE3o. Interface intuitiva, navega\xE7\xE3o f\xE1cil e possibilidades de entretenimento ilimitadas na sua tela grande. Seu portal pessoal para o mundo da televis\xE3o digital!",
          bg: "\u0423\u0434\u043E\u0431\u043D\u043E \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0437\u0430 IPTV - \u043E\u0442\u0432\u043E\u0440\u0435\u0442\u0435 \u0434\u043E\u0441\u0442\u044A\u043F \u0434\u043E \u043C\u043D\u043E\u0436\u0435\u0441\u0442\u0432\u043E \u043A\u0430\u043D\u0430\u043B\u0438, \u0444\u0438\u043B\u043C\u0438 \u0438 \u0441\u0435\u0440\u0438\u0430\u043B\u0438 \u0434\u0438\u0440\u0435\u043A\u0442\u043D\u043E \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u043E\u0440. \u0418\u043D\u0442\u0443\u0438\u0442\u0438\u0432\u0435\u043D \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441, \u043B\u0435\u0441\u043D\u0430 \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F \u0438 \u043D\u0435\u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438 \u0432\u044A\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438 \u0437\u0430 \u0437\u0430\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430 \u0433\u043E\u043B\u0435\u043C\u0438\u044F \u0432\u0438 \u0435\u043A\u0440\u0430\u043D. \u0412\u0430\u0448\u0438\u044F\u0442 \u043B\u0438\u0447\u0435\u043D \u043F\u043E\u0440\u0442\u0430\u043B \u043A\u044A\u043C \u0441\u0432\u0435\u0442\u0430 \u043D\u0430 \u0446\u0438\u0444\u0440\u043E\u0432\u0430\u0442\u0430 \u0442\u0435\u043B\u0435\u0432\u0438\u0437\u0438\u044F!"
        },
        iptv_confirm_delete_playlist: {
          ru: "\u0412\u044B \u0442\u043E\u0447\u043D\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442?",
          en: "Are you sure you want to delete the playlist?",
          uk: "\u0412\u0438 \u0442\u043E\u0447\u043D\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442?",
          be: "\u0412\u044B \u045E\u043F\u044D\u045E\u043D\u0435\u043D\u044B\u044F, \u0448\u0442\u043E \u0445\u043E\u0447\u0430\u0446\u0435 \u0432\u044B\u0434\u0430\u043B\u0456\u0446\u044C \u043F\u043B\u0435\u0439\u043B\u0456\u0441\u0442?",
          zh: "\u60A8\u786E\u5B9A\u8981\u5220\u9664\u64AD\u653E\u5217\u8868\u5417\uFF1F",
          pt: "Tem certeza de que deseja excluir a lista de reprodu\xE7\xE3o?",
          bg: "\u0421\u0438\u0433\u0443\u0440\u043D\u0438 \u043B\u0438 \u0441\u0442\u0435, \u0447\u0435 \u0438\u0441\u043A\u0430\u0442\u0435 \u0434\u0430 \u0438\u0437\u0442\u0440\u0438\u0435\u0442\u0435 \u0441\u043F\u0438\u0441\u044A\u043A\u0430 \u0441 \u043A\u0430\u043D\u0430\u043B\u0438?"
        },
        iptv_cache_clear: {
          ru: "\u041A\u0435\u0448 \u0443\u0434\u0430\u043B\u0435\u043D",
          en: "Cache cleared",
          uk: "\u041A\u0435\u0448 \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E",
          be: "\u041A\u0435\u0448 \u0432\u044B\u0434\u0430\u043B\u0435\u043D\u044B",
          zh: "\u7F13\u5B58\u5DF2\u6E05\u9664",
          pt: "Cache limpo",
          bg: "\u041A\u0435\u0448\u044A\u0442 \u0435 \u0438\u0437\u0447\u0438\u0441\u0442\u0435\u043D"
        },
        iptv_playlist_deleted: {
          ru: "\u041F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u0443\u0434\u0430\u043B\u0435\u043D",
          en: "Playlist deleted",
          uk: "\u041F\u043B\u0435\u0439\u043B\u0438\u0441\u0442 \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E",
          be: "\u041F\u043B\u0435\u0439\u043B\u0456\u0441\u0442 \u0432\u044B\u0434\u0430\u043B\u0435\u043D\u044B",
          zh: "\u64AD\u653E\u5217\u8868\u5DF2\u5220\u9664",
          pt: "Lista de reprodu\xE7\xE3o exclu\xEDda",
          bg: "\u041F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u044A\u0442 \u0435 \u0438\u0437\u0442\u0440\u0438\u0442"
        },
        iptv_playlist_add_set_url: {
          ru: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 URL \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430",
          en: "Enter the playlist URL",
          uk: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C URL \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430",
          be: "\u0423\u043A\u0430\u0436\u044B\u0446\u0435 URL \u043F\u043B\u0435\u0439\u043B\u0456\u0441\u0442\u0430",
          zh: "\u8BF7\u8F93\u5165\u64AD\u653E\u5217\u8868\u7684 URL",
          pt: "Insira o URL da lista de reprodu\xE7\xE3o",
          bg: "\u0412\u044A\u0432\u0435\u0434\u0435\u0442\u0435 URL \u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430"
        },
        iptv_playlist_add_new: {
          ru: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442",
          en: "Add new playlist",
          uk: "\u0414\u043E\u0434\u0430\u0442\u0438 \u043D\u043E\u0432\u0438\u0439 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442",
          be: "\u0414\u0430\u0434\u0430\u0446\u044C \u043D\u043E\u0432\u044B \u043F\u043B\u0435\u0439\u043B\u0456\u0441\u0442",
          zh: "\u6DFB\u52A0\u65B0\u64AD\u653E\u5217\u8868",
          pt: "Adicionar nova lista de reprodu\xE7\xE3o",
          bg: "\u0414\u043E\u0431\u0430\u0432\u044F\u043D\u0435 \u043D\u0430 \u043D\u043E\u0432 \u0441\u043F\u0438\u0441\u044A\u043A \u0441 \u043A\u0430\u043D\u0430\u043B\u0438"
        },
        iptv_playlist_url_changed: {
          ru: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430",
          en: "Link changed",
          uk: "\u041F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
          be: "\u0421\u043F\u0430\u0441\u044B\u043B\u043A\u0430 \u0437\u043C\u0435\u043D\u0435\u043D\u0430",
          zh: "\u94FE\u63A5\u5DF2\u66F4\u6539",
          pt: "Link alterado",
          bg: "\u0412\u0440\u044A\u0437\u043A\u0430\u0442\u0430 \u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u0430"
        },
        iptv_playlist_add_set_name: {
          ru: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430",
          en: "Enter the playlist name",
          uk: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u043D\u0430\u0437\u0432\u0443 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430",
          be: "\u0423\u043A\u0430\u0436\u044B\u0446\u0435 \u043D\u0430\u0437\u0432\u0443 \u043F\u043B\u0435\u0439\u043B\u0456\u0441\u0442\u0430",
          zh: "\u8BF7\u8F93\u5165\u64AD\u653E\u5217\u8868\u540D\u79F0",
          pt: "Insira o nome da lista de reprodu\xE7\xE3o",
          bg: "\u0412\u044A\u0432\u0435\u0434\u0435\u0442\u0435 \u0438\u043C\u0435 \u043D\u0430 \u043F\u043B\u0435\u0439\u043B\u0438\u0441\u0442\u0430"
        },
        iptv_playlist_name_changed: {
          ru: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E",
          en: "Name changed",
          uk: "\u041D\u0430\u0437\u0432\u0430 \u0437\u043C\u0456\u043D\u0435\u043D\u0430",
          be: "\u041D\u0430\u0437\u0432\u0430 \u0437\u043C\u0435\u043D\u0435\u043D\u0430",
          zh: "\u540D\u79F0\u5DF2\u66F4\u6539",
          pt: "Nome alterado",
          bg: "\u0418\u043C\u0435\u0442\u043E \u0435 \u043F\u0440\u043E\u043C\u0435\u043D\u0435\u043D\u043E"
        },
        iptv_playlist_change_name: {
          ru: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
          en: "Change name",
          uk: "\u0417\u043C\u0456\u043D\u0438\u0442\u0438 \u043D\u0430\u0437\u0432\u0443",
          be: "\u0417\u043C\u044F\u043D\u0456\u0446\u044C \u043D\u0430\u0437\u0432\u0443",
          zh: "\u66F4\u6539\u540D\u79F0",
          pt: "Alterar nome",
          bg: "\u041F\u0440\u043E\u043C\u044F\u043D\u0430 \u043D\u0430 \u0438\u043C\u0435\u0442\u043E"
        },
        iptv_param_view_in_main: {
          ru: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043A\u0430\u043D\u0430\u043B\u044B \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u043E\u0439",
          en: "Show channels on main page",
          uk: "\u041F\u043E\u043A\u0430\u0437\u0443\u0432\u0430\u0442\u0438 \u043A\u0430\u043D\u0430\u043B\u0438 \u043D\u0430 \u0433\u043E\u043B\u043E\u0432\u043D\u0456\u0439",
          be: "\u041F\u0430\u043A\u0430\u0437\u0432\u0430\u0446\u044C \u043A\u0430\u043D\u0430\u043B\u044B \u043D\u0430 \u0433\u0430\u043B\u043E\u045E\u043D\u0430\u0439",
          zh: "\u5728\u4E3B\u9875\u4E0A\u663E\u793A\u9891\u9053",
          pt: "Mostrar canais na p\xE1gina principal",
          bg: "\u041F\u043E\u043A\u0430\u0437\u0432\u0430\u043D\u0435 \u043D\u0430 \u043A\u0430\u043D\u0430\u043B\u0438 \u043D\u0430 \u0433\u043B\u0430\u0432\u043D\u0430\u0442\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430"
        }
      });
    }
    var Lang = {
      init
    };

    class Channel {
      constructor(data, playlist) {
        this.data = data;
        this.playlist = playlist;
      }
      /**
       * Загрузить шаблон
       */
      build() {
        this.card = Lampa.Template.js("cub_iptv_channel_main_board");
        this.icon = this.card.querySelector(".iptv-channel__ico") || {};
        this.card.addEventListener("visible", this.visible.bind(this));
      }
      /**
       * Загрузить картинку
       */
      image() {
        this.icon.onload = () => {
          this.card.classList.add("loaded");
          if (this.data.logo.indexOf("epg.it999") == -1) {
            this.card.addClass("small--icon");
          }
        };
        this.icon.onerror = () => {
          let simb = document.createElement("div");
          simb.addClass("iptv-channel__simb");
          simb.text(this.data.name.length <= 3 ? this.data.name.toUpperCase() : this.data.name.replace(/[^a-z|а-я|0-9]/gi, "").toUpperCase()[0]);
          let text = document.createElement("div");
          text.addClass("iptv-channel__name");
          text.text(Utils.clear(this.data.name));
          this.card.querySelector(".iptv-channel__body").append(simb);
          this.card.querySelector(".iptv-channel__body").append(text);
        };
      }
      /**
       * Создать
       */
      create() {
        this.build();
        this.card.addEventListener("hover:focus", () => {
          if (this.onFocus) this.onFocus(this.card, this.data);
        });
        this.card.addEventListener("hover:hover", () => {
          if (this.onHover) this.onHover(this.card, this.data);
        });
        this.card.addEventListener("hover:enter", () => {
          let play = {
            title: this.data.name || "",
            url: this.data.url,
            tv: true
          };
          Lampa.Player.runas(Lampa.Storage.field("player_iptv"));
          Lampa.Player.play(play);
          Lampa.Player.playlist(this.playlist.map((a) => {
            return {
              title: a.name,
              url: a.url,
              tv: true
            };
          }));
        });
        this.image();
      }
      emit() {
      }
      use() {
      }
      /**
       * Загружать картинку если видна карточка
       */
      visible() {
        if (this.data.logo) this.icon.src = this.data.logo;
        else this.icon.onerror();
        if (this.onVisible) this.onVisible(this.card, this.data);
      }
      /**
       * Уничтожить
       */
      destroy() {
        this.icon.onerror = () => {
        };
        this.icon.onload = () => {
        };
        this.icon.src = "";
        this.card.remove();
        this.card = null;
        this.icon = null;
      }
      /**
       * Рендер
       * @returns {object}
       */
      render(js) {
        return js ? this.card : $(this.card);
      }
    }

    function startPlugin() {
      window.plugin_iptv_ready = true;
      let manifest = {
        type: "video",
        version: "1.2.8",
        name: "IPTV",
        description: "",
        component: "iptv",
        onMain: (data) => {
          if (!Lampa.Storage.field("iptv_view_in_main")) return { results: [] };
          let playlist = Lampa.Arrays.clone(Lampa.Storage.get("iptv_play_history_main_board", "[]")).reverse();
          return {
            results: playlist,
            title: Lampa.Lang.translate("title_continue"),
            nomore: true,
            line_type: "iptv",
            cardClass: (item) => {
              return new Channel(item, playlist);
            }
          };
        }
      };
      Lampa.Manifest.plugins = manifest;
      if (Lampa.Manifest.app_digital >= 300) {
        Lampa.ContentRows.add({
          index: 1,
          screen: ["main"],
          call: (params, screen) => {
            if (!Lampa.Storage.field("iptv_view_in_main")) return;
            let playlist = Lampa.Arrays.clone(Lampa.Storage.get("iptv_play_history_main_board", "[]")).reverse();
            return function(call) {
              playlist.forEach((item) => {
                item.params = {
                  createInstance: (item2) => new Channel(item2, playlist)
                };
              });
              call({
                results: playlist,
                title: Lampa.Lang.translate("title_continue")
              });
            };
          }
        });
      }
      function add() {
        let button = $(`<li class="menu__item selector">
            <div class="menu__ico">
                <svg height="36" viewBox="0 0 38 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="8" width="34" height="21" rx="3" stroke="currentColor" stroke-width="3"/>
                    <line x1="13.0925" y1="2.34874" x2="16.3487" y2="6.90754" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                    <line x1="1.5" y1="-1.5" x2="9.31665" y2="-1.5" transform="matrix(-0.757816 0.652468 0.652468 0.757816 26.197 2)" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                    <line x1="9.5" y1="34.5" x2="29.5" y2="34.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="menu__text">${window.lampa_settings.iptv ? Lampa.Lang.translate("player_playlist") : "IPTV"}</div>
        </li>`);
        button.on("hover:enter", function() {
          if (window.lampa_settings.iptv) {
            if (Lampa.Activity.active().component == "iptv") return Lampa.Activity.active().activity.component.playlist();
          }
          Lampa.Activity.push({
            url: "",
            title: "IPTV",
            component: "iptv",
            page: 1
          });
        });
        $(".menu .menu__list").eq(0).append(button);
        $("body").append(Lampa.Template.get("cub_iptv_style", {}, true));
        if (window.lampa_settings.iptv) {
          $(".head .head__action.open--search").addClass("hide");
          $(".head .head__action.open--premium").remove();
          $(".head .head__action.open--feed").remove();
          $('.navigation-bar__body [data-action="main"]').unbind().on("click", () => {
            Lampa.Activity.active().activity.component.playlist();
          });
          $('.navigation-bar__body [data-action="search"]').addClass("hide");
        }
      }
      Lang.init();
      Templates.init();
      Settings.init();
      EPG.init();
      Guide.init();
      Lampa.Component.add("iptv", Component);
      if (window.lampa_settings.iptv) {
        Lampa.Storage.set("start_page", "last");
        window.start_deep_link = { component: "iptv" };
      }
      if (window.appready) add();
      else {
        Lampa.Listener.follow("app", function(e) {
          if (e.type == "ready") add();
        });
      }
    }
    if (!window.plugin_iptv_ready) startPlugin();

})();
