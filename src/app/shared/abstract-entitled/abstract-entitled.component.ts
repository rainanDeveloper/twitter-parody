import { Directive, OnInit } from "@angular/core";

@Directive()
export abstract class AbstractEntitledComponent implements OnInit {
  private mainTitle = 'Twitter (Parody)';
  abstract title: string;

  ngOnInit(): void {
    document.title = `${this.title} | ${this.mainTitle}`;
  }
}