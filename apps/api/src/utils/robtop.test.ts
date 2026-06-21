import { describe, expect, it } from 'vitest'
import { parseGetGJLevels21 } from './robtop'

// Real getGJLevels21 response for a "bloodbath" search (5 levels). We query by
// id (type=10) which returns a single level, but the parser always takes the
// first — so this richer fixture exercises the creator/song joins too.
const BLOODBATH_RESPONSE =
  '1:10565740:2:Bloodbath:5:3:6:503085:8:10:9:50:10:170836653:12:0:13:21:14:5484858:17:1:43:6:25::18:10:19:3206:42:0:45:24746:3:V2hvc2UgYmxvb2Qgd2lsbCBiZSBzcGlsdCBpbiB0aGUgQmxvb2RiYXRoPyBXaG8gd2lsbCB0aGUgdmljdG9ycyBiZT8gSG93IG1hbnkgd2lsbCBzdXJ2aXZlPyBHb29kIGx1Y2suLi4=:15:3:30:7679228:31:0:37:0:38:0:39:0:46:1:47:2:35:467339|1:21761387:2:Bloodbath Z:5:1:6:3277407:8:10:9:20:10:20195372:12:0:13:20:14:446688:17:1:43:4:25::18:10:19:6328:42:0:45:0:3:UmVtYWtlIG9mIEJCLCBidXQgU2hvcnRlciBhbmQgbXVjaCBlYXNpZXIgWEQgTW9yZSBvZiBhIGdhbWVwbGF5IGxldmVsISAgSnVzdCBhIGZ1biBlYXN5IGRlbW9uLiBWZXJpZmllZCBCeSBYaW9kYXplciEgRW5qb3kgOkQ=:15:3:30:0:31:0:37:3:38:1:39:10:46:1:47:2:35:223469|1:64968478:2:Bloodbath but no:5:1:6:19747356:8:10:9:50:10:6967991:12:0:13:21:14:283065:17::43:6:25::18:8:19:19849:42:0:45:23233:3:Qmxvb2RiYXRoLCBJdCdzIG5vdCBldmVuIHRoaXM=:15:3:30:0:31:0:37:0:38:1:39:8:46:1:47:2:35:706340|1:75795864:2:Bloodbath:5:3:6:12348083:8:10:9:40:10:856380:12:0:13:22:14:20292:17::43:5:25::18:7:19:24643:42:0:45:55985:3:VGhhbmtzIHRvIGV2ZXJ5b25lIGluIG15IGRpc2NvcmQgc2VydmVyIHRoYXQgY29udHJpYnV0ZWQ=:15:3:30:75393195:31:0:37:0:38:1:39:6:46:1:47:2:35:513064|1:32256905:2:Bloodbath noclip:5:1:6:17869201:8:10:9:40:10:256320:12:0:13:21:14:1916:17::43:5:25::18:0:19:0:42:0:45:13997:3::15:3:30:10565740:31:0:37:0:38:0:39:8:46:1:47:2:35:467339#503085:Riot:37415|3277407:Zyzyx:88354|12348083:KNOEPPEL:3009121|17869201:CoolManGame2:5599333|19747356:Texic:6152129#1~|~223469~|~2~|~ParagonX9 - HyperioxX~|~3~|~31~|~4~|~ParagonX9~|~5~|~3.77~|~6~|~~|~10~|~-~|~16~|~~|~7~|~~|~8~|~1~:~1~|~467339~|~2~|~At the Speed of Light~|~3~|~52~|~4~|~Dimrain47~|~5~|~9.56~|~6~|~~|~10~|~https%3A%2F%2Fgeometrydashcontent.b-cdn.net%2Fsongs%2F467339.mp3~|~16~|~~|~7~|~~|~8~|~1~:~1~|~513064~|~2~|~EnV - Uprise~|~3~|~149~|~4~|~Envy~|~5~|~8.71~|~6~|~~|~10~|~http%3A%2F%2Faudio.ngfiles.com%2F513000%2F513064_EnV---Uprise.mp3~|~16~|~~|~7~|~UCaRqE7rKwJl1BvMRU4FFVJQ~|~8~|~1~:~1~|~706340~|~2~|~-At the Speed of Light- (8 bit Remix)~|~3~|~46724~|~4~|~ThaPredator~|~5~|~4.78~|~6~|~~|~10~|~-~|~16~|~~|~7~|~~|~8~|~1#5:0:10#2a869972e889b08ab70a94c3f84560b2f12d2aed'

describe('parseGetGJLevels21', () => {
  it('parses the first level with creator + custom song joined in', () => {
    const level = parseGetGJLevels21(BLOODBATH_RESPONSE)
    expect(level).not.toBeNull()
    if (!level) return

    expect(level.name).toBe('Bloodbath')
    expect(level.isDemon).toBe(true)
    expect(level.inGameDifficulty).toBe('Extreme Demon')
    expect(level.partialDiff).toBe('demon-extreme')
    expect(level.isRated).toBe(true)
    expect(level.stars).toBe(10)
    expect(level.platformer).toBe(false)
    expect(level.length).toBe('Long')

    // Creator joined from the creators section (503085:Riot:37415).
    expect(level.creator).toBe('Riot')
    expect(level.creatorPlayerId).toBe('503085')
    expect(level.creatorAccountId).toBe('37415')

    // Custom song joined from the songs section (id 467339).
    expect(level.songId).toBe('467339')
    expect(level.officialSongId).toBeNull()
    expect(level.songName).toBe('At the Speed of Light')
    expect(level.songAuthor).toBe('Dimrain47')
    expect(level.songSize).toBe('9.56MB')
    expect(level.songLink).toBe(
      'https://geometrydashcontent.b-cdn.net/songs/467339.mp3'
    )

    // Stats + flags.
    expect(level.downloads).toBe(170836653)
    expect(level.likes).toBe(5484858)
    expect(level.featured).toBe(true)
    expect(level.featureScore).toBe(3206)
    expect(level.epicValue).toBe(0)
    expect(level.objectCount).toBe(24746)
    expect(level.coins).toBe(0)
    expect(level.copiedFromId).toBe('7679228')
    expect(level.levelVersion).toBe(3)
    expect(level.gameVersion).toBe('2.1')
    expect(level.editorSeconds).toBe(1)
    expect(level.editorSecondsTotal).toBe(2)

    // base64 description decoded.
    expect(level.description).toBe(
      'Whose blood will be spilt in the Bloodbath? Who will the victors be? How many will survive? Good luck...'
    )

    // Not provided by getGJLevels21.
    expect(level.creatorPoints).toBeNull()
    expect(level.orbs).toBeNull()
    expect(level.diamonds).toBeNull()
  })

  it('returns null for the "-1" not-found sentinel and empty bodies', () => {
    expect(parseGetGJLevels21('-1')).toBeNull()
    expect(parseGetGJLevels21('')).toBeNull()
    expect(parseGetGJLevels21('  \n')).toBeNull()
  })

  it('resolves official-song name/author from the static table', () => {
    // A non-demon, official-song (Deadlocked = index 19) level: key 35 (custom
    // song) is 0, key 12 (official song) is 19, denom 10 / numerator 30 = Hard.
    const response =
      '1:999:2:Official Song Level:5:1:6:42:8:10:9:30:13:22:18:9:35:0:12:19:15:5:42:1#42:Tester:7#1~|~~|~2~|~#1:0:10#hash'
    const level = parseGetGJLevels21(response)
    expect(level).not.toBeNull()
    if (!level) return

    expect(level.inGameDifficulty).toBe('Hard')
    expect(level.isDemon).toBe(false)
    expect(level.songId).toBeNull()
    expect(level.officialSongId).toBe(19)
    expect(level.songName).toBe('Deadlocked')
    expect(level.songAuthor).toBe('F-777')
    // length 5 ⇒ platformer; epic 1 ⇒ featured glow source.
    expect(level.platformer).toBe(true)
    expect(level.epicValue).toBe(1)
    expect(level.creator).toBe('Tester')
  })
})
