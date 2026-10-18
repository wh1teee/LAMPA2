(function () {
    'use strict';

    function Collection(data, params = {}) {
      this.data = data;
      function remove(elem) {
        if (elem) elem.remove();
      }
      this.build = function() {
        this.item = Lampa.Template.js("cub_collection");
        this.img = this.item.find(".card__img");
        this.icon = this.item.find(".cub-collection-card__user-icon img");
        this.item.find(".card__title").text(Lampa.Utils.capitalizeFirstLetter(data.title));
        this.item.find(".cub-collection-card__items").text(data.items_count);
        this.item.find(".cub-collection-card__date").text(Lampa.Utils.parseTime(data.time).full);
        this.item.find(".cub-collection-card__views").text(Lampa.Utils.bigNumberToShort(data.views));
        this.item.find(".full-review__like-counter").text(Lampa.Utils.bigNumberToShort(data.liked));
        this.item.find(".cub-collection-card__user-name").text(data.username);
        this.item.addEventListener("visible", this.visible.bind(this));
      };
      this.image = function() {
        this.img.onload = () => {
          this.item.classList.add("card--loaded");
        };
        this.img.onerror = () => {
          this.img.src = "./img/img_broken.svg";
        };
        this.icon.onload = () => {
          this.item.find(".cub-collection-card__user-icon").classList.add("loaded");
        };
        this.icon.onerror = () => {
          this.icon.src = "./img/img_broken.svg";
        };
      };
      this.create = function() {
        this.build();
        this.item.addEventListener("hover:focus", () => {
          if (this.onFocus) this.onFocus(this.item, data);
        });
        this.item.addEventListener("hover:touch", () => {
          if (this.onTouch) this.onTouch(this.item, data);
        });
        this.item.addEventListener("hover:hover", () => {
          if (this.onHover) this.onHover(this.item, data);
        });
        this.item.addEventListener("hover:enter", () => {
          Lampa.Activity.push({
            url: data.id,
            collection: data,
            title: Lampa.Utils.capitalizeFirstLetter(data.title),
            component: "cub_collections_view",
            page: 1
          });
        });
        this.item.addEventListener("hover:long", () => {
          Lampa.Loading.start(() => {
            Lampa.Loading.stop();
            Lampa.Controller.toggle("content");
          });
          Api.status(data, (status) => {
            Lampa.Loading.stop();
            let items = [];
            let voited = Lampa.Storage.cache("collections_voited", 100, []);
            items.push({
              title: "\u041A\u043E\u043B\u043Be\u043A\u0446\u0438\u0438 @" + data.username,
              onSelect: () => {
                Lampa.Activity.push({
                  url: "user_" + data.cid,
                  title: "\u041A\u043E\u043B\u043Be\u043A\u0446\u0438\u0438 @" + data.username,
                  component: "cub_collections_collection",
                  page: 1
                });
                Lampa.Controller.toggle("content");
              }
            });
            items.push({
              title: Lampa.Lang.translate(status.saved ? "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0445" : "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0435"),
              onSelect: () => {
                Lampa.Controller.toggle("content");
                Api.save(data, () => {
                  Lampa.Bell.push({ text: Lampa.Lang.translate(status.saved ? "\u0423\u0431\u0440\u0430\u043D\u043E \u0438\u0437 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0445" : "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0435") });
                });
              }
            });
            items.push({
              title: Lampa.Lang.translate("more"),
              separator: true
            });
            if (voited.indexOf(data.id) == -1) {
              items = items.concat([
                {
                  title: '<span class="settings-param__label">+1</span> ' + Lampa.Lang.translate("title_like"),
                  like: 1
                },
                {
                  title: Lampa.Lang.translate("reactions_shit"),
                  like: -1
                }
              ]);
            }
            Lampa.Select.show({
              title: Lampa.Lang.translate("title_action"),
              items,
              onSelect: (item) => {
                Lampa.Controller.toggle("content");
                Api.liked({ id: data.id, dir: item.like }, () => {
                  voited.push(data.id);
                  Lampa.Storage.set("collections_voited", voited);
                  data.liked += item.like;
                  this.item.find(".full-review__like-counter").text(Lampa.Utils.bigNumberToShort(data.liked));
                  Lampa.Bell.push({ text: Lampa.Lang.translate("discuss_voited") });
                });
              },
              onBack: () => {
                Lampa.Controller.toggle("content");
              }
            });
          });
        });
        this.image();
      };
      this.visible = function() {
        this.img.src = Lampa.Api.img(data.backdrop_path, "w500");
        this.icon.src = "./img/profiles/" + (data.icon || "l_1") + ".png";
        if (this.onVisible) this.onVisible(this.item, data);
      };
      this.destroy = function() {
        this.img.onerror = () => {
        };
        this.img.onload = () => {
        };
        this.img.src = "";
        remove(this.item);
        this.item = null;
        this.img = null;
      };
      this.render = function(js) {
        return js ? this.item : $(this.item);
      };
    }

    const CATALOG = [
      {
        hpu: "num_releases",
        title: "\u26A1 \u0420\u0435\u043B\u0438\u0437\u044B NUM: 4K UHD, \u041D\u043E\u0432\u0438\u043D\u043A\u0438 \u0438 \u041B\u0435\u0433\u0435\u043D\u0434\u044B (\u0422\u043E\u0440\u0440\u0435\u043D\u0442\u044B \u0432 1 \u043A\u043B\u0438\u043A)",
        items: [
          {
            id: "num_4k_uhd",
            title: "\u{1F525} NUM: 4K UHD, Dolby Vision & BDRemux (980+ \u0440\u0435\u043B\u0438\u0437\u043E\u0432)",
            backdrop_path: "/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
            items_count: "989",
            time: "2026-10-18",
            views: 412e3,
            liked: 38900,
            username: "YouROK NUM 4K",
            icon: "l_1",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/4k_id.json",
            endpoint: "discover/movie?vote_count.gte=2500&sort_by=revenue.desc"
          },
          {
            id: "num_movies_new",
            title: "\u{1F3AC} NUM: \u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043D\u043E\u0432\u0438\u043D\u043A\u0438 \u043A\u0438\u043D\u043E (\u0421\u0432\u0435\u0436\u0438\u0435 \u0440\u0430\u0437\u0434\u0430\u0447\u0438)",
            backdrop_path: "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
            items_count: "940",
            time: "2026-10-18",
            views: 368e3,
            liked: 31400,
            username: "YouROK NUM",
            icon: "l_2",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/movies_id.json",
            endpoint: "trending/movie/week"
          },
          {
            id: "num_tv_new",
            title: "\u{1F4FA} NUM: \u041D\u043E\u0432\u044B\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B \u0438 \u0441\u0435\u0437\u043E\u043D\u044B (NUM Releases)",
            backdrop_path: "/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
            items_count: "836",
            time: "2026-10-18",
            views: 294e3,
            liked: 26700,
            username: "YouROK NUM TV",
            icon: "l_3",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/tv_id.json",
            endpoint: "trending/tv/week"
          },
          {
            id: "num_legends",
            title: "\u{1F3C6} NUM: \u041B\u0435\u0433\u0435\u043D\u0434\u044B \u043A\u0438\u043D\u043E \u0432 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435",
            backdrop_path: "/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg",
            items_count: "163",
            time: "2026-10-17",
            views: 385e3,
            liked: 35200,
            username: "NUM Legends",
            icon: "l_4",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/legends_id.json",
            endpoint: "movie/top_rated"
          },
          {
            id: "num_cartoons",
            title: "\u{1F9F8} NUM: \u041F\u043E\u043B\u043D\u043E\u043C\u0435\u0442\u0440\u0430\u0436\u043D\u044B\u0435 \u043C\u0443\u043B\u044C\u0442\u0444\u0438\u043B\u044C\u043C\u044B (4K / FHD)",
            backdrop_path: "/2u7zbn8EudG6kLlBzUYqP8RyFU4.jpg",
            items_count: "84",
            time: "2026-10-16",
            views: 218e3,
            liked: 19500,
            username: "NUM Cartoons",
            icon: "l_5",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/cartoons_id.json",
            endpoint: "discover/movie?with_genres=16&sort_by=popularity.desc"
          },
          {
            id: "num_cartoons_tv",
            title: "\u{1F9F8} NUM: \u041C\u0443\u043B\u044C\u0442\u0441\u0435\u0440\u0438\u0430\u043B\u044B (\u0421\u0432\u0435\u0436\u0438\u0435 \u0440\u0435\u043B\u0438\u0437\u044B)",
            backdrop_path: "/wcaDIAG1QdXQLRaj4vC1EFdBT2.jpg",
            items_count: "725",
            time: "2026-10-16",
            views: 204e3,
            liked: 18900,
            username: "NUM Cartoons TV",
            icon: "l_1",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/cartoons_tv_id.json",
            endpoint: "discover/tv?with_genres=16&sort_by=popularity.desc"
          },
          {
            id: "num_anime",
            title: "\u26E9\uFE0F NUM: \u041B\u0443\u0447\u0448\u0435\u0435 \u0410\u043D\u0438\u043C\u0435 (\u0421\u0432\u0435\u0436\u0438\u0435 \u0440\u0435\u043B\u0438\u0437\u044B)",
            backdrop_path: "/mSDsSDwaP3E7dEfUPWy4J0djt4O.jpg",
            items_count: "812",
            time: "2026-10-16",
            views: 196e3,
            liked: 18400,
            username: "NUM Anime",
            icon: "l_6",
            cid: "num_releases",
            num_feed_url: "http://releases.yourok.ru/releases/anime_id.json",
            endpoint: "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc"
          }
        ]
      },
      {
        hpu: "num_ai",
        title: "\u{1F916} \u0418\u0418-\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438 NUM (\u041D\u0435\u0439\u0440\u043E\u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0438 \u0441 \u0433\u043E\u0442\u043E\u0432\u044B\u043C\u0438 \u0442\u043E\u0440\u0440\u0435\u043D\u0442\u0430\u043C\u0438)",
        items: []
      },
      {
        hpu: "studios",
        title: "\u0421\u0442\u0440\u0438\u043C\u0438\u043D\u0433\u043E\u0432\u044B\u0435 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B \u0438 \u0421\u0442\u0443\u0434\u0438\u0438 (Originals)",
        items: [
          {
            id: "netflix_originals",
            title: "Netflix Originals \u2014 \u0425\u0438\u0442\u044B \u0438 \u041F\u0440\u0435\u043C\u044C\u0435\u0440\u044B",
            backdrop_path: "/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
            items_count: "240+",
            time: "2026-10-15",
            views: 184500,
            liked: 14200,
            username: "Netflix Hub",
            icon: "l_1",
            cid: "studios",
            endpoint: "discover/tv?with_networks=213&sort_by=popularity.desc"
          },
          {
            id: "hbo_max",
            title: "HBO & Max \u2014 \u041F\u0440\u0435\u043C\u0438\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B",
            backdrop_path: "/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
            items_count: "180+",
            time: "2026-10-14",
            views: 162300,
            liked: 15800,
            username: "HBO Prestige",
            icon: "l_2",
            cid: "studios",
            endpoint: "discover/tv?with_networks=49&sort_by=vote_average.desc&vote_count.gte=250"
          },
          {
            id: "apple_tv_plus",
            title: "Apple TV+ \u2014 \u042D\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432\u044B \u0432 4K HDR",
            backdrop_path: "/n5FPNMJ0eRoiQrKGfUQQRAZeaxg.jpg",
            items_count: "120+",
            time: "2026-10-12",
            views: 119400,
            liked: 11300,
            username: "Apple TV+",
            icon: "l_3",
            cid: "studios",
            endpoint: "discover/tv?with_networks=2552&sort_by=popularity.desc"
          },
          {
            id: "amazon_prime",
            title: "Amazon Prime Video \u2014 \u0411\u043B\u043E\u043A\u0431\u0430\u0441\u0442\u0435\u0440\u044B",
            backdrop_path: "/mY7SeH4HFFxW1hiI6cWuwCRKptN.jpg",
            items_count: "190+",
            time: "2026-10-10",
            views: 108200,
            liked: 9600,
            username: "Prime Video",
            icon: "l_4",
            cid: "studios",
            endpoint: "discover/tv?with_networks=1024&sort_by=popularity.desc"
          },
          {
            id: "marvel_disney",
            title: "Disney+ & \u041A\u0438\u043D\u043E\u0432\u0441\u0435\u043B\u0435\u043D\u043D\u0430\u044F Marvel",
            backdrop_path: "/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
            items_count: "150+",
            time: "2026-10-08",
            views: 215e3,
            liked: 18900,
            username: "Marvel & Disney",
            icon: "l_5",
            cid: "studios",
            endpoint: "discover/movie?with_companies=420&sort_by=popularity.desc"
          },
          {
            id: "a24_cinema",
            title: "\u0421\u0442\u0443\u0434\u0438\u044F A24 \u2014 \u0410\u0432\u0442\u043E\u0440\u0441\u043A\u043E\u0435 \u0438 \u043A\u0443\u043B\u044C\u0442\u043E\u0432\u043E\u0435 \u043A\u0438\u043D\u043E",
            backdrop_path: "/ss0Os3uWJfQAENILHZUdX8Tt1OC.jpg",
            items_count: "110+",
            time: "2026-10-05",
            views: 94800,
            liked: 12400,
            username: "A24 Selection",
            icon: "l_6",
            cid: "studios",
            endpoint: "discover/movie?with_companies=41077&sort_by=vote_average.desc&vote_count.gte=150"
          }
        ]
      },
      {
        hpu: "top",
        title: "\u0417\u043E\u043B\u043E\u0442\u043E\u0439 \u0444\u043E\u043D\u0434 \u0438 \u0420\u0435\u0439\u0442\u0438\u043D\u0433\u0438 (IMDb & \u041A\u0438\u043D\u043E\u043F\u043E\u0438\u0441\u043A)",
        items: [
          {
            id: "top_250_imdb_kp",
            title: "\u0417\u043E\u043B\u043E\u0442\u043E\u0439 \u0444\u043E\u043D\u0434: \u0422\u043E\u043F 250 IMDb & \u041A\u0438\u043D\u043E\u043F\u043E\u0438\u0441\u043A",
            backdrop_path: "/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg",
            items_count: "250",
            time: "2026-10-16",
            views: 342e3,
            liked: 29400,
            username: "CubPro VIP",
            icon: "l_1",
            cid: "top",
            endpoint: "movie/top_rated"
          },
          {
            id: "top_series_all_time",
            title: "\u0412\u0435\u043B\u0438\u0447\u0430\u0439\u0448\u0438\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B \u0432\u0441\u0435\u0445 \u0432\u0440\u0435\u043C\u0451\u043D (IMDb 8.5+)",
            backdrop_path: "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
            items_count: "200",
            time: "2026-10-15",
            views: 278e3,
            liked: 24100,
            username: "CubPro VIP",
            icon: "l_2",
            cid: "top",
            endpoint: "tv/top_rated"
          },
          {
            id: "uhd_4k_imax",
            title: "\u042D\u0442\u0430\u043B\u043E\u043D 4K UHD, IMAX & Dolby Vision",
            backdrop_path: "/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
            items_count: "160+",
            time: "2026-10-14",
            views: 198500,
            liked: 17600,
            username: "4K Masters",
            icon: "l_3",
            cid: "top",
            endpoint: "discover/movie?vote_count.gte=3000&sort_by=revenue.desc"
          },
          {
            id: "trending_world",
            title: "\u0413\u043B\u0430\u0432\u043D\u044B\u0435 \u0445\u0438\u0442\u044B \u043D\u0435\u0434\u0435\u043B\u0438 (\u041C\u0438\u0440\u043E\u0432\u043E\u0439 \u0442\u0440\u0435\u043D\u0434)",
            backdrop_path: "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
            items_count: "100",
            time: "2026-10-17",
            views: 156e3,
            liked: 13200,
            username: "Trending",
            icon: "l_4",
            cid: "top",
            endpoint: "trending/movie/week"
          }
        ]
      },
      {
        hpu: "themes",
        title: "\u0422\u0435\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0438 \u0438 \u041D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u044F",
        items: [
          {
            id: "mind_bending_twists",
            title: "\u0418\u0433\u0440\u044B \u0440\u0430\u0437\u0443\u043C\u0430 \u0438 \u041D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u0444\u0438\u043D\u0430\u043B (\u0422\u0432\u0438\u0441\u0442\u044B)",
            backdrop_path: "/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
            items_count: "140+",
            time: "2026-10-13",
            views: 210400,
            liked: 19800,
            username: "Cinema Mind",
            icon: "l_5",
            cid: "themes",
            endpoint: "discover/movie?with_genres=53,9648&vote_count.gte=1500&sort_by=vote_average.desc"
          },
          {
            id: "scifi_space_cyberpunk",
            title: "\u041A\u043E\u0441\u043C\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u041E\u0434\u0438\u0441\u0441\u0435\u044F \u0438 \u041A\u0438\u0431\u0435\u0440\u043F\u0430\u043D\u043A (Sci-Fi)",
            backdrop_path: "/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg",
            items_count: "180+",
            time: "2026-10-11",
            views: 187900,
            liked: 16900,
            username: "Sci-Fi Club",
            icon: "l_6",
            cid: "themes",
            endpoint: "discover/movie?with_genres=878&vote_count.gte=1200&sort_by=vote_average.desc"
          },
          {
            id: "dark_detective_noir",
            title: "\u041C\u0440\u0430\u0447\u043D\u044B\u0435 \u0414\u0435\u0442\u0435\u043A\u0442\u0438\u0432\u044B, \u041D\u0443\u0430\u0440 \u0438 \u0420\u0430\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F",
            backdrop_path: "/c2OijvbFEXBW1onbzuvENr4CGQB.jpg",
            items_count: "120+",
            time: "2026-10-09",
            views: 134e3,
            liked: 12100,
            username: "Noir Detective",
            icon: "l_1",
            cid: "themes",
            endpoint: "discover/tv?with_genres=80,9648&vote_count.gte=300&sort_by=vote_average.desc"
          },
          {
            id: "epic_fantasy_worlds",
            title: "\u042D\u043F\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0424\u044D\u043D\u0442\u0435\u0437\u0438 \u0438 \u041C\u0438\u0440\u044B \u041F\u0440\u0438\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439",
            backdrop_path: "/2u7zbn8EudG6kLlBzUYqP8RyFU4.jpg",
            items_count: "150+",
            time: "2026-10-07",
            views: 175600,
            liked: 15400,
            username: "Fantasy Hub",
            icon: "l_2",
            cid: "themes",
            endpoint: "discover/movie?with_genres=14,12&vote_count.gte=1500&sort_by=vote_average.desc"
          },
          {
            id: "anime_masterpieces",
            title: "\u0428\u0435\u0434\u0435\u0432\u0440\u044B \u0410\u043D\u0438\u043C\u0435 (\u041F\u043E\u043B\u043D\u043E\u043C\u0435\u0442\u0440\u0430\u0436\u043D\u044B\u0435 \u0438 \u0421\u0435\u0440\u0438\u0430\u043B\u044B)",
            backdrop_path: "/mSDsSDwaP3E7dEfUPWy4J0djt4O.jpg",
            items_count: "200+",
            time: "2026-10-06",
            views: 164200,
            liked: 16100,
            username: "Anime Pro",
            icon: "l_3",
            cid: "themes",
            endpoint: "discover/movie?with_genres=16&with_original_language=ja&vote_count.gte=400&sort_by=vote_average.desc"
          },
          {
            id: "heist_crime_gangsters",
            title: "\u041E\u0433\u0440\u0430\u0431\u043B\u0435\u043D\u0438\u044F, \u0410\u0444\u0435\u0440\u044B \u0438 \u041A\u0440\u0438\u043C\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u0430\u0433\u0438",
            backdrop_path: "/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
            items_count: "130+",
            time: "2026-10-04",
            views: 149e3,
            liked: 13800,
            username: "Crime Classics",
            icon: "l_4",
            cid: "themes",
            endpoint: "discover/movie?with_genres=80,18&vote_count.gte=1500&sort_by=vote_average.desc"
          }
        ]
      }
    ];
    function syncDynamicCatalog() {
      let aiSection = CATALOG.find((c) => c.hpu === "num_ai");
      if (aiSection && window.Lampa && Lampa.CubPro && Lampa.CubPro.getNumAiCollectionsCatalog) {
        aiSection.items = Lampa.CubPro.getNumAiCollectionsCatalog();
      }
    }
    function getSavedIds() {
      return Lampa.Storage.get("cub_pro_saved_collections", "[]");
    }
    function findCollectionById(id) {
      syncDynamicCatalog();
      for (let i = 0; i < CATALOG.length; i++) {
        let found = CATALOG[i].items.find((item) => item.id === id);
        if (found) return found;
      }
      return CATALOG[0].items[0];
    }
    function makeLine(catTitle, catKey, items) {
      return {
        title: catTitle,
        collection: true,
        line_type: "collection",
        category: catKey,
        results: items.map((item) => Object.assign({}, item)),
        cardClass: (elem, param) => {
          return new Collection(elem, param);
        }
      };
    }
    function main(params, oncomplite, onerror) {
      syncDynamicCatalog();
      let fulldata = [];
      let savedIds = getSavedIds();
      if (savedIds.length) {
        let savedItems = savedIds.map((id) => findCollectionById(id)).filter(Boolean);
        if (savedItems.length) {
          fulldata.push(makeLine("\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0435 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438", "saved", savedItems));
        }
      }
      CATALOG.forEach((cat) => {
        if (cat.items && cat.items.length) {
          fulldata.push(makeLine(cat.title, cat.hpu, cat.items));
        }
      });
      oncomplite(fulldata);
    }
    function collection(params, oncomplite, onerror) {
      syncDynamicCatalog();
      let catKey = (params.url || "").replace(/^user_/, "");
      let cat = CATALOG.find((c) => c.hpu === catKey) || CATALOG[0];
      oncomplite({
        title: cat.title,
        collection: true,
        total_pages: 1,
        results: cat.items.map((item) => Object.assign({}, item)),
        cardClass: (elem, param) => {
          return new Collection(elem, param);
        }
      });
    }
    function liked(params, callback) {
      if (callback) callback({ secuses: true });
    }
    function tmdbGet(url, params, oncomplite, onerror) {
      if (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.get) {
        Lampa.Api.sources.tmdb.get(url, params, oncomplite, onerror);
      } else if (onerror) {
        onerror();
      }
    }
    function hydrateNumSlice(rawItems, page, totalPages, fallbackEndpoint, oncomplite, onerror) {
      if (!Array.isArray(rawItems) || !rawItems.length) {
        fallbackTmdb(fallbackEndpoint, page, oncomplite, onerror);
        return;
      }
      let pending = rawItems.length;
      let cards = new Array(rawItems.length);
      rawItems.forEach((entry, idx) => {
        let mType = entry.media_type || "movie";
        tmdbGet(mType + "/" + entry.id, {}, (cardData) => {
          if (cardData && cardData.id) {
            cardData.source = "tmdb";
            if (Array.isArray(entry.torrent) && entry.torrent.length) {
              cardData.num_torrents = entry.torrent;
            }
            if (window.Lampa && Lampa.CubPro && Lampa.CubPro.getReleaseQuality) {
              Lampa.CubPro.getReleaseQuality(cardData);
            }
            cards[idx] = cardData;
          }
          if (--pending === 0) {
            let valid = cards.filter(Boolean);
            if (valid.length) {
              oncomplite({
                results: valid,
                page,
                total_pages: totalPages
              });
            } else {
              fallbackTmdb(fallbackEndpoint, page, oncomplite, onerror);
            }
          }
        }, () => {
          if (--pending === 0) {
            let valid = cards.filter(Boolean);
            if (valid.length) {
              oncomplite({
                results: valid,
                page,
                total_pages: totalPages
              });
            } else {
              fallbackTmdb(fallbackEndpoint, page, oncomplite, onerror);
            }
          }
        });
      });
    }
    function fallbackTmdb(endpoint, page, oncomplite, onerror) {
      tmdbGet(endpoint || "movie/top_rated", { page }, (data) => {
        if (data && Array.isArray(data.results)) {
          data.results.forEach((item) => {
            item.source = "tmdb";
          });
          data.total_pages = Math.min(data.total_pages || 10, 15);
          oncomplite(data);
        } else if (onerror) onerror();
      }, onerror);
    }
    function full(params, oncomplite, onerror) {
      let col = findCollectionById(params.url);
      let page = params.page || 1;
      let endpoint = col ? col.endpoint : "movie/top_rated";
      let pageSize = 18;
      if (col && col.num_feed_url && window.Lampa && Lampa.CubPro && Lampa.CubPro.fetchNumJson) {
        Lampa.CubPro.fetchNumJson(col.num_feed_url).then((json) => {
          let list = json && Array.isArray(json.items) ? json.items : [];
          if (!list.length) {
            fallbackTmdb(endpoint, page, oncomplite, onerror);
            return;
          }
          let totalPages = Math.min(15, Math.ceil(list.length / pageSize));
          let slice = list.slice((page - 1) * pageSize, page * pageSize);
          hydrateNumSlice(slice, page, totalPages, endpoint, oncomplite, onerror);
        });
        return;
      }
      if (col && typeof col.ai_index === "number" && window.Lampa && Lampa.CubPro && Lampa.CubPro.fetchNumJson) {
        Lampa.CubPro.fetchNumJson(Lampa.CubPro.NUM_AI_COLLECTIONS_URL).then((json) => {
          let aiCol = Array.isArray(json) ? json[col.ai_index] : null;
          let list = aiCol && Array.isArray(aiCol.parts) ? aiCol.parts : [];
          if (!list.length) {
            fallbackTmdb(endpoint, page, oncomplite, onerror);
            return;
          }
          let totalPages = Math.max(1, Math.ceil(list.length / pageSize));
          let slice = list.slice((page - 1) * pageSize, page * pageSize);
          hydrateNumSlice(slice, page, totalPages, endpoint, oncomplite, onerror);
        });
        return;
      }
      fallbackTmdb(endpoint, page, oncomplite, onerror);
    }
    function status(params, callback) {
      let savedIds = getSavedIds();
      if (callback) callback({ saved: savedIds.indexOf(params.id) !== -1 });
    }
    function save(params, callback) {
      let savedIds = getSavedIds();
      let idx = savedIds.indexOf(params.id);
      if (idx === -1) savedIds.push(params.id);
      else savedIds.splice(idx, 1);
      Lampa.Storage.set("cub_pro_saved_collections", savedIds);
      if (callback) callback({ secuses: true });
    }
    function clear() {
    }
    var Api = {
      main,
      collection,
      full,
      clear,
      liked,
      status,
      save
    };

    function component$2(object) {
      let comp = new Lampa.InteractionMain(object);
      comp.create = function() {
        this.activity.loader(true);
        Api.main(object, (data) => {
          this.build(data);
        }, this.empty.bind(this));
        return this.render();
      };
      comp.onMore = function(data) {
        Lampa.Activity.push({
          url: data.category + (data.category == "user" ? "_" + data.cid : ""),
          title: data.title,
          component: "cub_collections_collection",
          page: 1
        });
      };
      return comp;
    }

    function component$1(object) {
      let comp = new Lampa.InteractionCategory(object);
      comp.create = function() {
        Api.full(object, (data) => {
          this.build(data);
          comp.render().find(".category-full").addClass("mapping--grid cols--6");
        }, this.empty.bind(this));
      };
      comp.nextPageReuest = function(object2, resolve, reject) {
        Api.full(object2, resolve.bind(comp), reject.bind(comp));
      };
      return comp;
    }

    function component(object) {
      let comp = new Lampa.InteractionCategory(object);
      comp.create = function() {
        Api.collection(object, this.build.bind(this), this.empty.bind(this));
      };
      comp.nextPageReuest = function(object2, resolve, reject) {
        Api.collection(object2, resolve.bind(comp), reject.bind(comp));
      };
      comp.cardRender = function(object2, element, card) {
        card.onMenu = false;
        card.onEnter = () => {
          Lampa.Activity.push({
            url: element.id,
            title: element.title,
            component: "cub_collections_view",
            page: 1
          });
        };
      };
      return comp;
    }

    function startPlugin() {
      let manifest = {
        type: "video",
        version: "1.1.2",
        name: "\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438",
        description: "",
        component: "cub_collections"
      };
      Lampa.Manifest.plugins = manifest;
      Lampa.Component.add("cub_collections_main", component$2);
      Lampa.Component.add("cub_collections_collection", component);
      Lampa.Component.add("cub_collections_view", component$1);
      Lampa.Template.add("cub_collection", `<div class="card cub-collection-card selector layer--visible layer--render card--collection">
        <div class="card__view">
            <img src="./img/img_load.svg" class="card__img">
            <div class="cub-collection-card__head">
                <div class="cub-collection-card__items"></div>
                <div class="cub-collection-card__date"></div>
            </div>
            <div class="cub-collection-card__bottom">
                <div class="cub-collection-card__views"></div>
                <div class="cub-collection-card__liked">
                    <div class="full-review__like-icon">
                        <svg width="29" height="27" viewBox="0 0 29 27" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M8.0131 9.05733H3.75799C2.76183 9.05903 1.80696 9.45551 1.10257 10.1599C0.39818 10.8643 0.00170332 11.8192 0 12.8153V23.0778C0.00170332 24.074 0.39818 25.0289 1.10257 25.7333C1.80696 26.4377 2.76183 26.8341 3.75799 26.8358H23.394C24.2758 26.8354 25.1294 26.5252 25.8056 25.9594C26.4819 25.3936 26.9379 24.6082 27.094 23.7403L28.9408 13.4821C29.038 12.9408 29.0153 12.3849 28.8743 11.8534C28.7333 11.3218 28.4774 10.8277 28.1247 10.4058C27.7721 9.98391 27.3311 9.6445 26.833 9.41151C26.3349 9.17852 25.7918 9.05762 25.2419 9.05733H18.5043V3.63509C18.5044 2.90115 18.2824 2.18438 17.8673 1.57908C17.4522 0.973783 16.8636 0.508329 16.179 0.243966C15.4943 -0.0203976 14.7456 -0.0712821 14.0315 0.0980078C13.3173 0.267298 12.6712 0.648829 12.178 1.1924L12.1737 1.19669C10.5632 2.98979 9.70849 5.78681 8.79584 7.79142C8.6423 8.14964 8.45537 8.49259 8.23751 8.81574C8.16898 8.90222 8.09358 8.98301 8.01203 9.05733H8.0131ZM6.54963 23.6147H3.75799C3.68706 23.6147 3.61686 23.6005 3.55156 23.5728C3.48626 23.5452 3.42719 23.5046 3.37789 23.4536C3.32786 23.4047 3.28819 23.3463 3.26126 23.2817C3.23433 23.2171 3.22068 23.1478 3.22113 23.0778V12.8164C3.22068 12.7464 3.23433 12.6771 3.26126 12.6125C3.28819 12.548 3.32786 12.4895 3.37789 12.4406C3.42719 12.3896 3.48626 12.3491 3.55156 12.3214C3.61686 12.2937 3.68706 12.2795 3.75799 12.2795H6.54963V23.6147ZM9.77077 11.7599C10.3704 11.336 10.8649 10.7803 11.216 10.1353C11.8221 8.94289 12.3599 7.71687 12.8265 6.46324C13.2315 5.33852 13.818 4.28775 14.5627 3.3527C14.6197 3.29181 14.6935 3.24913 14.7747 3.23003C14.8559 3.21093 14.9409 3.21625 15.0191 3.24533C15.0976 3.27557 15.165 3.32913 15.2122 3.3988C15.2594 3.46848 15.2842 3.55093 15.2832 3.63509V10.6679C15.2831 10.8794 15.3246 11.0889 15.4055 11.2844C15.4864 11.4799 15.605 11.6575 15.7546 11.8071C15.9042 11.9566 16.0818 12.0753 16.2773 12.1562C16.4727 12.237 16.6822 12.2786 16.8938 12.2785H25.2419C25.3207 12.2784 25.3986 12.2961 25.4698 12.3301C25.5409 12.3641 25.6036 12.4136 25.6531 12.4749C25.7042 12.5345 25.7411 12.6049 25.7612 12.6807C25.7813 12.7566 25.784 12.836 25.7691 12.913L23.9223 23.1723C23.8993 23.296 23.834 23.4077 23.7376 23.4885C23.6412 23.5692 23.5197 23.6138 23.394 23.6147H9.77077V11.7599Z" fill="currentColor"></path>
                        </svg>
                    </div>
                    <div class="full-review__like-counter"></div>
                </div>
                <div class="cub-collection-card__user-name"></div>
                <div class="cub-collection-card__user-icon">
                    <img >
                </div>
            </div>
        </div>
        <div class="card__title"></div>
    </div>`);
      let style = `
        <style>
        .cub-collection-card__head {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  -webkit-box-pack: justify;  -webkit-justify-content: space-between;      -ms-flex-pack: justify;          justify-content: space-between;  padding: 0.5em 1em;  color: #fff;  font-size: 1em;  font-weight: 500;  position: absolute;  top: 0;  left: 0;  width: 100%;}.cub-collection-card__bottom {  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;  padding: 0.5em 1em;  background-color: rgba(0, 0, 0, 0.5);  color: #fff;  font-size: 1em;  font-weight: 400;  -webkit-border-radius: 1em;          border-radius: 1em;  position: absolute;  bottom: 0;  left: 0;  width: 100%;}.cub-collection-card__liked {  padding-left: 1em;  display: -webkit-box;  display: -webkit-flex;  display: -ms-flexbox;  display: flex;  -webkit-box-align: center;  -webkit-align-items: center;      -ms-flex-align: center;          align-items: center;}.cub-collection-card__liked .full-review__like-icon {  margin-top: -0.2em;}.cub-collection-card__liked .full-review__like-counter {  font-weight: 600;}.cub-collection-card__items {  background: rgba(0, 0, 0, 0.5);  padding: 0.3em;  -webkit-border-radius: 0.2em;          border-radius: 0.2em;}.cub-collection-card__user-name {  padding: 0 1em;  margin-left: auto;}.cub-collection-card__user-icon {  width: 2em;  height: 2em;  -webkit-border-radius: 100%;          border-radius: 100%;  background-color: #fff;  border: 0.2em solid #fff;}.cub-collection-card__user-icon img {  width: 100%;  height: 100%;  -webkit-border-radius: 100%;          border-radius: 100%;  opacity: 0;}.cub-collection-card__user-icon.loaded img {  opacity: 1;}.category-full .cub-collection-card {  padding-bottom: 2em;}body.glass--style .cub-collection-card__bottom, body.glass--style .cub-collection-card__items {  background-color: rgba(0, 0, 0, 0.3);  -webkit-backdrop-filter: blur(1.6em);          backdrop-filter: blur(1.6em);}body.light--version .cub-collection-card__bottom {  -webkit-border-radius: 0;          border-radius: 0;}@media screen and (max-width: 767px) {  .category-full .cub-collection-card {    width: 33.3%;  }}@media screen and (max-width: 580px) {  .category-full .cub-collection-card {    width: 50%;  }}@media screen and (max-width: 991px) {  body.light--version .category-full .cub-collection-card {    width: 33.3%;  }}@media screen and (max-width: 580px) {  body.light--version .category-full .cub-collection-card {    width: 50%;  }}@media screen and (max-width: 991px) {  body.light--version.size--bigger .category-full .cub-collection-card {    width: 50%;  }}
        </style>
    `;
      Lampa.Template.add("cub_collections_css", style);
      $("body").append(Lampa.Template.get("cub_collections_css", {}, true));
      function add() {
        let button = $(`<li class="menu__item selector">
            <div class="menu__ico">
                <svg width="191" height="239" viewBox="0 0 191 239" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M35.3438 35.3414V26.7477C35.3438 19.9156 38.0594 13.3543 42.8934 8.51604C47.7297 3.68251 54.2874 0.967027 61.125 0.966431H164.25C171.086 0.966431 177.643 3.68206 182.482 8.51604C187.315 13.3524 190.031 19.91 190.031 26.7477V186.471C190.031 189.87 189.022 193.192 187.133 196.018C185.245 198.844 182.561 201.046 179.421 202.347C176.28 203.647 172.825 203.988 169.492 203.325C166.158 202.662 163.096 201.026 160.692 198.623L155.656 193.587V220.846C155.656 224.245 154.647 227.567 152.758 230.393C150.87 233.219 148.186 235.421 145.046 236.722C141.905 238.022 138.45 238.363 135.117 237.7C131.783 237.037 128.721 235.401 126.317 232.998L78.3125 184.993L30.3078 232.998C27.9041 235.401 24.8419 237.037 21.5084 237.7C18.1748 238.363 14.7195 238.022 11.5794 236.722C8.43922 235.421 5.75517 233.219 3.86654 230.393C1.9779 227.567 0.969476 224.245 0.96875 220.846V61.1227C0.96875 54.2906 3.68437 47.7293 8.51836 42.891C13.3547 38.0575 19.9124 35.342 26.75 35.3414H35.3438ZM138.469 220.846V61.1227C138.469 58.8435 137.563 56.6576 135.952 55.046C134.34 53.4343 132.154 52.5289 129.875 52.5289H26.75C24.4708 52.5289 22.2849 53.4343 20.6733 55.046C19.0617 56.6576 18.1562 58.8435 18.1562 61.1227V220.846L66.1609 172.841C69.3841 169.619 73.755 167.809 78.3125 167.809C82.87 167.809 87.2409 169.619 90.4641 172.841L138.469 220.846ZM155.656 169.284L172.844 186.471V26.7477C172.844 24.4685 171.938 22.2826 170.327 20.671C168.715 19.0593 166.529 18.1539 164.25 18.1539H61.125C58.8458 18.1539 56.6599 19.0593 55.0483 20.671C53.4367 22.2826 52.5312 24.4685 52.5312 26.7477V35.3414H129.875C136.711 35.3414 143.268 38.0571 148.107 42.891C152.94 47.7274 155.656 54.285 155.656 61.1227V169.284Z" fill="currentColor"/>
                </svg>
            </div>
            <div class="menu__text">${manifest.name}</div>
        </li>`);
        button.on("hover:enter", function() {
          Lampa.Activity.push({
            url: "",
            title: manifest.name,
            component: "cub_collections_main",
            page: 1
          });
        });
        $(".menu .menu__list").eq(0).append(button);
      }
      if (window.appready) add();
      else {
        Lampa.Listener.follow("app", function(e) {
          if (e.type == "ready") add();
        });
      }
    }
    if (!window.cub_collections_ready && Lampa.Manifest.app_digital >= 242) startPlugin();

})();
