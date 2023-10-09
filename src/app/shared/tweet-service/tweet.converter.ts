import { Injectable } from '@angular/core';
import { DataLoadType } from '@domain/data-load.type';
import { TEventId } from '@domain/event-id.type';
import { NostrEventKind } from '@domain/nostr-event-kind';
import { TNostrPublic } from '@domain/nostr-public.type';
import { IReaction } from '@domain/reaction.interface';
import { IRetweet } from '@domain/retweet.interface';
import { ITweet } from '@domain/tweet.interface';
import { IZap } from '@domain/zap.interface';
import { HtmlfyService } from '@shared/htmlfy/htmlfy.service';
import { ProfileConverter } from '@shared/profile-service/profile.converter';
import { UrlUtil } from '@shared/util/url.service';
import { Event } from 'nostr-tools';
import { ITweetRelatedInfoWrapper } from './tweet-related-info-wrapper.interface';
import { TweetTagsConverter } from './tweet-tags.converter';
import { TweetCache } from './tweet.cache';
import { TweetTypeGuard } from './tweet.type-guard';

@Injectable({
  providedIn: 'root'
})
export class TweetConverter {

  constructor(
    private urlUtil: UrlUtil,
    private tweetTagsConverter: TweetTagsConverter,
    private htmlfyService: HtmlfyService,
    private tweetTypeGuard: TweetTypeGuard,
    private profilesConverter: ProfileConverter
  ) { }

  castResultsetToTweets(events: Event<NostrEventKind>[]): ITweetRelatedInfoWrapper {
    const timeline: ITweetRelatedInfoWrapper = {
      eager: [],
      lazy: [],
      npubs: []
    };

    // TODO: check in tags if tweets have mentions and then, create the threadfy method
    // eslint-disable-next-line complexity
    events.forEach(event => {
      if (this.tweetTypeGuard.isKind(event, NostrEventKind.Text)) {
        const { tweet, npubs } = this.castEventToTweet(event);
        timeline.eager.push(tweet);
        timeline.npubs = timeline.npubs.concat(npubs);
      } else if (this.tweetTypeGuard.isKind(event, NostrEventKind.Repost)) {
        const { retweet, tweet, npubs } = this.castEventToRetweet(event);
        timeline.eager.push(retweet);
        if (tweet.load === DataLoadType.LAZY_LOADED) {
          timeline.lazy.push(tweet);
        } else {
          timeline.eager.push(tweet);
        }
        timeline.npubs = timeline.npubs.concat(npubs);
      } else if (this.tweetTypeGuard.isKind(event, NostrEventKind.Reaction)) {
        const result = this.castEventReactionToLazyLoadTweet(event);
        if (result) {
          const { lazy, npubs } = result;
          timeline.lazy.push(lazy);
          timeline.npubs = timeline.npubs.concat(npubs);
        }
      } else if (this.tweetTypeGuard.isKind(event, NostrEventKind.Zap)) {
        const result = this.castEventZapToLazyLoadTweet(event);
        if (result) {
          const { lazy, npubs } = result;
          timeline.lazy.push(lazy);
          timeline.npubs = timeline.npubs.concat(npubs);
        }
      }
    });

    timeline.npubs = [...new Set(timeline.npubs)];

    return timeline;
  }

  getTweetReactionsLength(tweet?: ITweet | null): number {
    return tweet && Object.keys(tweet.reactions).length || 0;
  }

  getRetweetedByYou(tweet: ITweet | IRetweet): number {
    return Object.keys(tweet.retweetedBy || {}).length || 0;
  }

  private getSmallView(tweet: string, imgList: string[]): string {
    const maxLength = 280;
    let content = this.getFullView(tweet, imgList);
    if (content.length > maxLength) {
      content = content.substring(0, maxLength - 1);
      //  substituí eventual link cortado pela metade
      content = content.replace(/http[^ ]+$/, '');
      content += '…';
    }

    return content;
  }

  private getFullView(tweet: string, imgList: string[]): string {
    imgList?.forEach(img => tweet = tweet.replace(this.urlUtil.regexFromLink(img), ''))
    return tweet;
  }

  private castEventToRetweet(event: Event<NostrEventKind.Repost>): {
    retweet: IRetweet, tweet: ITweet, npubs: TNostrPublic[]
  } {
    const content = this.getTweetContent(event);
    const author = this.getAuthorNostrPublicFromEvent(event);
    let npubs: string[] = [author];
    let retweeted: ITweet;
    const simpleRetweetContent = '#[0]';

    if (content && content !== simpleRetweetContent) {
      //  FIXME: o elemento que passou pelo parse precisa ser indexado
      //  no cache, pois está ficando sem as informações complementarem
      //  lazy carregadas, como likes, retweets e zaps
      const retweetedEvent: Event<NostrEventKind.Text> = JSON.parse(content);
      const { tweet, npubs: npubs2 } = this.castEventToTweet(retweetedEvent);
      retweeted = tweet;
      npubs = npubs.concat(npubs2);
    } else {
      const idEvent = this.tweetTagsConverter.getMentionedEvent(event);
      if (!idEvent) {
        console.warn('[RELAY DATA WARNING] mentioned tweet not found in retweet', event);
      }

      const pubkey = this.tweetTagsConverter.getRelatedProfiles(event);
      //  TODO: validate it use pubkey.at(0) here is secure in retweeted events
      retweeted = this.createLazyLoadableTweetFromEventId(idEvent || '', pubkey.at(0));
    }

    const retweetAsTweet: Event<NostrEventKind.Text> = { ...event, content: '', kind: NostrEventKind.Text };
    const { tweet: retweet, npubs: npubs2 } = this.castEventToTweet(retweetAsTweet, retweeted.id);
    npubs = npubs.concat(npubs2);
    if (retweeted.author) {
      npubs.push(retweeted.author);
    }

    retweeted.retweetedBy = {
      [event.id]: author
    };

    return {
      retweet, tweet: retweeted, npubs
    };
  }

  private castEventZapToLazyLoadTweet(event: Event<NostrEventKind.Zap>): {
    lazy: ITweet<DataLoadType.LAZY_LOADED>, npubs: TNostrPublic[]
  } | null {
    const idEvent = this.tweetTagsConverter.getFirstRelatedEvent(event);
    const pubkey = this.tweetTagsConverter.getFirstRelatedProfile(event);
    if (!idEvent || !pubkey) {
      console.warn('[RELAY DATA WARNING] event not tagged with event and/or pubkey: ', event);
      return null;
    }

    const npub = this.profilesConverter.castPubkeyToNostrPublic(pubkey);
    const npubs = [npub];

    const reaction: IZap = {
      id: event.id,
      author: npub,
      content: event.content,
      tweet: idEvent
    };

    const lazy = this.createLazyLoadableTweetFromEventId(idEvent);
    lazy.zaps[event.id] = reaction;

    return { lazy, npubs };
  }

  private castEventReactionToLazyLoadTweet(event: Event<NostrEventKind.Reaction>): {
    lazy: ITweet<DataLoadType.LAZY_LOADED>, npubs: TNostrPublic[]
  } | null {
    const idEvent = this.tweetTagsConverter.getFirstRelatedEvent(event);
    if (!idEvent) {
      console.warn('[RELAY DATA WARNING] reaction not tagged with event: ', event);
      return null;
    }

    const npub = this.profilesConverter.castPubkeyToNostrPublic(event.pubkey);
    const npubs = [npub];

    const reaction: IReaction = {
      id: event.id,
      content: event.content,
      tweet: idEvent,
      author: npub
    };

    const lazy = this.createLazyLoadableTweetFromEventId(idEvent);
    lazy.reactions[event.id] = reaction;

    return { lazy, npubs };
  }

  createLazyLoadableTweetFromEventId(
    idEvent: string, pubkey?: string
  ): ITweet<DataLoadType.LAZY_LOADED> {
    const tweet: ITweet<DataLoadType.LAZY_LOADED> = {
      id: idEvent,
      reactions: {},
      zaps: {},
      load: DataLoadType.LAZY_LOADED
    };

    if (pubkey) {
      tweet.author = this.profilesConverter.castPubkeyToNostrPublic(pubkey);
    }

    return tweet;
  }

  getAuthorNostrPublicFromEvent(event: Event): TNostrPublic {
    return this.profilesConverter.castPubkeyToNostrPublic(event.pubkey);
  }

  private instanceTweet(event: Event<NostrEventKind.Text>, author: TNostrPublic): ITweet<DataLoadType.EAGER_LOADED> {
    const content = this.getTweetContent(event);
    const { urls, imageList, videoUrl, imgMatriz } = this.htmlfyService.separateImageAndLinks(content);

    const tweet: ITweet<DataLoadType.EAGER_LOADED> = {
      id: event.id, author, reactions: {},
      zaps: {}, created: this.getTweetCreated(event),
      load: DataLoadType.EAGER_LOADED,
      content, htmlSmallView: '', htmlFullView: '',
      urls, imageList, videoUrl, imgMatriz
    };

    /**
     * Getter and setter to access this data because mentions depend on profiles,
     * but author profile load after his mention, so the htmlfy must run when all
     * data is loaded
     */
    Object.defineProperty(tweet, "htmlSmallView", {
      get: () => {
        if (!tweet.htmlSmallViewLoaded) {
          tweet.htmlSmallViewLoaded = this.htmlfyService.safify(this.getSmallView(content, imageList));
        }

        return tweet.htmlSmallViewLoaded;
      },
    });

    Object.defineProperty(tweet, "htmlFullView", {
      get: () => {
        if (!tweet.htmlFullViewLoaded) {
          tweet.htmlFullViewLoaded = this.htmlfyService.safify(this.getFullView(content, imageList));
        }

        return tweet.htmlFullViewLoaded;
      },
    });

    return tweet;
  }

  private castEventToTweet(event: Event<NostrEventKind.Text>, retweeting: TEventId): {
    tweet: IRetweet, npubs: Array<string>
  };
  private castEventToTweet(event: Event<NostrEventKind.Text>): {
    tweet: ITweet<DataLoadType.EAGER_LOADED>, npubs: Array<string>
  };
  private castEventToTweet(event: Event<NostrEventKind.Text>, retweeting?: TEventId): {
    tweet: ITweet<DataLoadType.EAGER_LOADED> | IRetweet, npubs: Array<string>
  } {
    const author = this.getAuthorNostrPublicFromEvent(event);
    let npubs: string[] = [author];
    const tweet = this.instanceTweet(event, author);

    if (retweeting) {
      tweet.retweeting = retweeting;
    }

    npubs = npubs.concat(this.tweetTagsConverter.getNostrPublicFromTags(event));
    this.tweetTagsConverter.mergeCoordinatesFromEvent(tweet, event);
    this.tweetTagsConverter.mergeRetweetingFromEvent(tweet, event);

    return { tweet, npubs };
  }

  private getTweetContent(event: Event<NostrEventKind.Text | NostrEventKind.Repost>): string {
    return event.content || '';
  }

  private getTweetCreated(event: Event<NostrEventKind.Text | NostrEventKind.Repost>): number {
    return event.created_at || 0;
  }

  extractEventsFromTweets(tweets: ITweet[]): TEventId[] {
    return tweets.map(tweet => {
      const replies = tweet.replies || [];
      const repling = tweet.repling ? [tweet.repling] : [];
      const retweetedBy = tweet.retweetedBy || [];
      const retweeting = tweet.retweeting ? [tweet.retweeting] : [];

      return [...replies, ...repling, ...Object.keys(retweetedBy), ...retweeting];
    }).flat(1);
  }  
}
