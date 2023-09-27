import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ITweet } from '@domain/tweet.interface';
import { ITweetImgViewing } from '../tweet-img-viewing.interface';
import { DataLoadType } from '@domain/data-load.type';
import { TweetCache } from '@shared/tweet-service/tweet.cache';
import { IRetweet } from '@domain/retweet.interface';

@Component({
  selector: 'tw-tweet',
  templateUrl: './tweet.component.html',
  styleUrls: ['./tweet.component.scss']
})
export class TweetComponent {

  readonly EAGER_LOADED = DataLoadType.EAGER_LOADED;
  readonly LAZY_LOADED = DataLoadType.LAZY_LOADED;

  @Input()
  showImages = true;

  @Input()
  isFull = false;

  @Output()
  imgOpen = new EventEmitter<ITweetImgViewing | null>();

  imgList: string[] = [];
  imgs: [string, string?][] = [];

  smallView = '';
  fullView = '';

  interceptedTweet: ITweet | IRetweet | null = null;
  
  @Input()
  set tweet(tweet: ITweet | IRetweet | null) {
    this.interceptedTweet = tweet;
    this.showingTweet = this.getShowingTweet();
  }
  
  get tweet(): ITweet | IRetweet | null {
    return this.interceptedTweet;
  }

  showingTweet: ITweet | null = null;

  showMoreTextButton(): boolean {
    return this.smallView.length !== this.fullView.length;
  }

  getShowingTweet(): ITweet | null {
    if (!this.tweet) {
      return null;
    } else if (this.tweet.retweeting) {
      return TweetCache.get(this.tweet.retweeting);
    } else {
      return this.tweet;
    }
  }
}
