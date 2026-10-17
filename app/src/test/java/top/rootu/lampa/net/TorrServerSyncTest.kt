package top.rootu.lampa.net

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import top.rootu.lampa.PlayerStateManager

class TorrServerSyncTest {

    @Test
    fun `extractRef parses standard TorrServer stream query parameters`() {
        val url = "http://127.0.0.1:8090/stream/Breaking.Bad.S01E05.1080p.mkv?link=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4&index=5&play"
        val ref = TorrServerSync.extractRef(url)
        assertNotNull(ref)
        assertEquals("http://127.0.0.1:8090", ref?.baseUrl)
        assertEquals("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4", ref?.hash)
        assertEquals(5, ref?.fileIndex)
    }

    @Test
    fun `extractRef parses TorrServer play path format`() {
        val url = "http://192.168.1.50:8090/play/A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4/12"
        val ref = TorrServerSync.extractRef(url)
        assertNotNull(ref)
        assertEquals("http://192.168.1.50:8090", ref?.baseUrl)
        assertEquals("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4", ref?.hash)
        assertEquals(12, ref?.fileIndex)
    }

    @Test
    fun `isSameStreamUrl matches raw and percent-encoded Cyrillic and bracket URLs from ViMu and VLC`() {
        val rawPlaylistUrl = "http://127.0.0.1:8090/stream/[LostFilm] Сериал - S02E07 [1080p].mkv?link=0123456789abcdef0123456789abcdef01234567&index=7&play"
        val vimuReturnedUrl = "http://127.0.0.1:8090/stream/%5BLostFilm%5D%20%D0%A1%D0%B5%D1%80%D0%B8%D0%B0%D0%BB%20-%20S02E07%20%5B1080p%5D.mkv?link=0123456789abcdef0123456789abcdef01234567&index=7&preload"

        assertTrue(TorrServerSync.isSameStreamUrl(rawPlaylistUrl, vimuReturnedUrl))
    }

    @Test
    fun `isSameStreamUrl returns false for different episode index in same torrent`() {
        val ep1 = "http://127.0.0.1:8090/stream/Show.S01E01.mkv?link=0123456789abcdef0123456789abcdef01234567&index=1&play"
        val ep2 = "http://127.0.0.1:8090/stream/Show.S01E02.mkv?link=0123456789abcdef0123456789abcdef01234567&index=2&play"

        assertFalse(TorrServerSync.isSameStreamUrl(ep1, ep2))
    }

    @Test
    fun `inferSeasonAndEpisode extracts SxxExx and 1x05 patterns from title or URL`() {
        assertEquals(1 to 5, PlayerStateManager.inferSeasonAndEpisode("The Last of Us S01E05 2160p", null))
        assertEquals(2 to 10, PlayerStateManager.inferSeasonAndEpisode("Серия", "http://127.0.0.1:8090/stream/Show.s02.e10.mkv?index=10"))
        assertEquals(3 to 4, PlayerStateManager.inferSeasonAndEpisode("Show 3x04 [1080p]", null))
        assertEquals(null to null, PlayerStateManager.inferSeasonAndEpisode("Inception (2010) 4K UHD", "http://127.0.0.1:8090/stream/Inception.mkv"))
    }

    @Test
    fun `injectBasicAuthUrl embeds userInfo from TorrServer settings or Authorization header and matches original URL`() {
        top.rootu.lampa.AndroidJS.torrserverAuth = true
        top.rootu.lampa.AndroidJS.torrserverLogin = "torruser"
        top.rootu.lampa.AndroidJS.torrserverPassword = "secret"
        try {
            val rawUrl = "http://192.168.1.50:8090/stream/Episode.S01E03.mkv?link=0123456789abcdef0123456789abcdef01234567&index=3&play"
            val injectedUrl = TorrServerSync.injectBasicAuthUrl(rawUrl)
            assertEquals(
                "http://torruser:secret@192.168.1.50:8090/stream/Episode.S01E03.mkv?link=0123456789abcdef0123456789abcdef01234567&index=3&play",
                injectedUrl
            )
            // Must still match original URL when player returns the authenticated URL
            assertTrue(TorrServerSync.isSameStreamUrl(rawUrl, injectedUrl))
            // extractRef must strip user:pass@ from baseUrl
            val ref = TorrServerSync.extractRef(injectedUrl)
            assertEquals("http://192.168.1.50:8090", ref?.baseUrl)
        } finally {
            top.rootu.lampa.AndroidJS.torrserverAuth = false
            top.rootu.lampa.AndroidJS.torrserverLogin = ""
            top.rootu.lampa.AndroidJS.torrserverPassword = ""
        }
    }
}
