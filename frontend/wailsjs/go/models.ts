export namespace main {
	
	export class Asset {
	    dataURI: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new Asset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dataURI = source["dataURI"];
	        this.path = source["path"];
	    }
	}
	export class Document {
	    path: string;
	    name: string;
	    content: string;
	    size: number;
	    modifiedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Document(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.content = source["content"];
	        this.size = source["size"];
	        this.modifiedAt = source["modifiedAt"];
	    }
	}

}

